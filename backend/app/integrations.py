"""Transactional outbox, governed data products and optional MQTT/Kafka dispatch."""
import copy
import importlib.util
import json
import re
import threading
from typing import Literal
from urllib.parse import urlsplit
from fastapi import APIRouter,Depends,HTTPException,Query
from pydantic import Field,model_validator
from sqlalchemy import select,func
from sqlalchemy.orm import Session
from .db import Resource,Telemetry,User,SessionLocal,get_db,now
from .schemas import Input
from .security import roles,current_user
from .services import identifier,audit
from .industry import industry
from .supply.api import state_for
from .supply.engine import public_state
from .integration_plugins.mqtt import publish as mqtt_publish
from .integration_plugins.kafka import publish as kafka_publish

router=APIRouter(prefix='/api/integrations',tags=['Governance · lakehouse · optional adapters'])
_lock=threading.RLock()
PUBLISHERS={'mqtt':mqtt_publish,'kafka':kafka_publish}
DATASETS=[{'id':'stock','name':'위치·LOT 재고','owner':'warehouse-operations','grain':'lot_id + location_id','primary_key':['lot_id','location_id'],'fields':{'lot_id':'string','location_id':'string','quantity':'decimal(18,3)'},'lineage':['lots','movements']},{'id':'lots','name':'LOT 계보','owner':'quality-operations','grain':'lot_id','primary_key':['id'],'fields':{'id':'string','sku_id':'string','code':'string','manufactured_on':'date?','expires_on':'date?','supplier':'string','parents':'string[]','status':'enum','revision':'integer'},'lineage':['production','movements']},{'id':'boms','name':'BOM 버전','owner':'production-engineering','grain':'BOM id + revision','primary_key':['id','revision'],'fields':{'id':'string','name':'string','product_sku_id':'string','output_quantity':'decimal(18,3)','components':'{sku_id,quantity}[]','revision':'integer'},'lineage':['skus']},{'id':'movements','name':'재고 수불 원장','owner':'warehouse-operations','grain':'movement_id','primary_key':['id'],'fields':{'id':'string','action':'enum','lot_id':'string','sku_id':'string','quantity':'decimal(18,3)','from_location':'string?','to_location':'string?','reference':'string','timestamp':'datetime UTC','batch_id':'string?'},'lineage':['lots','boms']},{'id':'production','name':'생산 배치·BOM 스냅샷','owner':'production-operations','grain':'batch_id','primary_key':['batch_id'],'fields':{'batch_id':'string','lot_id':'string','movement_id':'string','bom_snapshot':'object','allocations':'object[]','quantity':'decimal(18,3)'},'lineage':['boms','lots']},{'id':'skus','name':'품목 마스터','owner':'master-data','grain':'sku_id','primary_key':['id'],'fields':{'id':'string','name':'string','category':'enum','unit':'enum','min_stock':'decimal(18,3)','revision':'integer'},'lineage':[]},{'id':'locations','name':'창고·로케이션','owner':'warehouse-operations','grain':'location_id','primary_key':['id'],'fields':{'id':'string','name':'string','warehouse':'string','zone':'string','allowed_categories':'string[]','revision':'integer'},'lineage':[]},{'id':'telemetry','name':'설비 수집 이벤트','owner':'manufacturing-operations','grain':'source + event_id','primary_key':['source','event_id'],'fields':{'id':'integer cursor','event_id':'string','source':'string','asset_id':'string','temperature':'number','vibration':'number','good':'integer','rejected':'integer','timestamp':'datetime UTC'},'lineage':['assets']}]
class TransportConfig(Input):
    plugin:Literal['mqtt','kafka']='mqtt'
    enabled:bool=False
    endpoint:str=Field(default='mqtts://localhost:8883',min_length=3,max_length=200)
    topic:str=Field(default='forge.factory.events.v1',pattern=r'^[a-zA-Z0-9/_.-]{1,120}$')
    tls:bool=True
    username_env:str=Field(default='',max_length=100)
    password_env:str=Field(default='',max_length=100)
    @model_validator(mode='after')
    def valid(self):
        for key in (self.username_env,self.password_env):
            if key and not re.fullmatch(r'INTEGRATION_[A-Z0-9_]+',key):raise ValueError('인증정보는 INTEGRATION_ 접두사의 환경변수 이름만 참조하세요.')
        if self.password_env and not self.username_env:raise ValueError('사용자명 환경변수도 설정하세요.')
        if self.plugin=='mqtt':
            parsed=urlsplit(self.endpoint)
            if parsed.scheme not in ('mqtt','mqtts') or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ('','/'):raise ValueError('mqtt(s)://host:port 주소를 입력하세요. 인증정보를 URL에 포함할 수 없습니다.')
            parsed.port
        elif not re.fullmatch(r'[A-Za-z0-9._:\[\]-]+(,[A-Za-z0-9._:\[\]-]+)*',self.endpoint):raise ValueError('Kafka bootstrap host:port 목록을 입력하세요.')
        if self.plugin=='kafka' and bool(self.username_env)!=bool(self.password_env):raise ValueError('Kafka 인증 환경변수 두 항목을 함께 설정하세요.')
        return self
class SaveConfig(Input):
    expected_revision:int=Field(ge=1)
    config:TransportConfig
class Dispatch(Input):
    limit:int=Field(default=1,ge=1,le=5)

def config(db):
    row=db.get(Resource,'INTEGRATION-CONFIG')
    return row.data if row else {'revision':1,'config':TransportConfig().model_dump()}
def initialize_integrations():
    with SessionLocal() as db:
        if not db.get(Resource,'INTEGRATION-CONFIG'):
            db.add(Resource(id='INTEGRATION-CONFIG',category='integration_config',name='외부 이벤트 전송 플러그인',status='disabled',data=config(db)));db.commit()

def enqueue(db,event_type,subject,payload):
    event={'specversion':'1.0','id':identifier('EVT'),'type':'forge.'+event_type+'.v1','source':'urn:forge:plant:default','subject':subject,'time':now(),'datacontenttype':'application/json','dataschema':'urn:forge:schema:'+event_type+':1','industry':industry(db)['config']['id'],'governance':{'classification':'internal','owner':'manufacturing-operations','schema_version':1,'quality_status':'validated'},'data':copy.deepcopy(payload)}
    db.add(Resource(id=event['id'],category='integration_event',name=event_type,status='pending',data={'event':event,'attempts':0,'last_error':None,'receipt':None}))
    return event

@router.get('/catalog')
def catalog(user:User=Depends(current_user)):
    return {'schema_version':1,'classification':'internal','timestamp_standard':'UTC ISO8601','decimal_encoding':'base-unit decimal strings, scale 3; no implicit unit conversion','delivery_semantics':'at-least-once; deduplicate by event.id','datasets':[{**d,'schema_version':1,'classification':'internal','steward':d['owner'],'quality_rules':['known identifiers','nonnegative balances','no BOM cycles','approved and unexpired LOT for consumption']} for d in DATASETS],'plugins':[{'id':'mqtt','name':'MQTT publisher','package':'paho-mqtt','installed':importlib.util.find_spec('paho') is not None,'mode':'explicit dispatch; QoS 1 PUBACK'},{'id':'kafka','name':'Kafka publisher','package':'confluent-kafka','installed':importlib.util.find_spec('confluent_kafka') is not None,'mode':'explicit dispatch; delivery callback ACK'},{'id':'mcp','name':'Read-only MCP stdio server','package':'mcp','installed':importlib.util.find_spec('mcp') is not None,'mode':'optional separate process; GET tools only'}]}
@router.get('/config')
def get_config(user:User=Depends(roles('admin')),db:Session=Depends(get_db)):return config(db)
@router.post('/config')
def set_config(body:SaveConfig,user:User=Depends(roles('admin')),db:Session=Depends(get_db)):
    row=db.scalar(select(Resource).where(Resource.id=='INTEGRATION-CONFIG').with_for_update())
    if row.data['revision']!=body.expected_revision:raise HTTPException(409,'플러그인 설정이 변경되었습니다.')
    row.data={'revision':body.expected_revision+1,'config':body.config.model_dump()};row.status='configured' if body.config.enabled else 'disabled';audit(db,user.email,'integration.configure',body.config.plugin);db.commit();return row.data
@router.get('/events')
def events(user:User=Depends(roles('admin')),db:Session=Depends(get_db)):
    rows=db.scalars(select(Resource).where(Resource.category=='integration_event').order_by(Resource.created_at.desc()).limit(100)).all()
    counts=dict(db.execute(select(Resource.status,func.count()).where(Resource.category=='integration_event').group_by(Resource.status)).all())
    return {'counts':counts,'events':[{'id':r.id,'status':r.status,**r.data} for r in rows]}
@router.post('/dispatch')
def dispatch(body:Dispatch,user:User=Depends(roles('admin')),db:Session=Depends(get_db)):
    with _lock:
        settings=config(db)['config']
        if not settings['enabled']:raise HTTPException(409,'전송 플러그인을 먼저 구성·활성화하세요.')
        rows=db.scalars(select(Resource).where(Resource.category=='integration_event',Resource.status.in_(['pending','failed'])).order_by(Resource.created_at).limit(body.limit).with_for_update(skip_locked=True)).all();results=[]
        for row in rows:
            data=copy.deepcopy(row.data);data['attempts']+=1
            try:
                receipt=PUBLISHERS[settings['plugin']](data['event'],settings)
                if not receipt.get('acknowledged'):raise RuntimeError('acknowledgement missing')
                row.status='delivered';data.update(receipt=receipt,delivered_at=now(),last_error=None,plugin=settings['plugin'])
            except Exception as error:
                row.status='failed';data['last_error']=type(error).__name__;data['receipt']=None
            row.data=data;results.append({'id':row.id,'status':row.status,'last_error':data['last_error']})
        audit(db,user.email,'integration.dispatch',settings['plugin'],{'events':len(results)});db.commit();return {'results':results}
@router.get('/export/{dataset}')
def export(dataset:str,after_id:int=Query(default=0,ge=0),limit:int=Query(default=1000,ge=1,le=10000),user:User=Depends(current_user),db:Session=Depends(get_db)):
    definition=next((d for d in DATASETS if d['id']==dataset),None)
    if not definition:raise HTTPException(404,'데이터 제품을 찾을 수 없습니다.')
    if dataset=='telemetry':
        events=db.scalars(select(Telemetry).where(Telemetry.id>after_id).order_by(Telemetry.id).limit(limit)).all();rows=[{c.name:getattr(e,c.name) for c in Telemetry.__table__.columns} for e in events];next_cursor=events[-1].id if events else after_id
    else:
        state=state_for(db);key={'stock':'balances','production':'batches'}.get(dataset,dataset);rows=copy.deepcopy(state[key]);next_cursor=None
    return {'manifest':{**definition,'schema_version':1,'classification':'internal','snapshot_id':identifier('SNP'),'captured_at':now(),'industry':industry(db)['config']['id'],'next_cursor':next_cursor,'row_count':len(rows)},'rows':rows}
