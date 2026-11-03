"""Line panel composition, published kiosk snapshots and CCTV configuration."""
import copy
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import urlsplit
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field, field_validator, model_validator
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .schemas import Input
from .db import Resource, Asset, Telemetry, User, LoginSession, get_db, now, SessionLocal
from .security import roles, current_user, bearer
from .services import add_resource, audit, asset_dict

router=APIRouter(prefix='/api',tags=['Field panels & CCTV'])
Template=Literal['production','equipment','quality','work-order','andon','logistics','notice','cctv','agents']

class Screen(Input):
    id:str=Field(min_length=1,max_length=60,pattern=r'^[a-zA-Z0-9_-]+$')
    template:Template
    title:str=Field(min_length=1,max_length=60)
    duration:int=Field(default=20,ge=10,le=300)
    message:str=Field(default='',max_length=1000)

class CameraWidget(Input):
    enabled:bool=False
    camera_ids:list[str]=Field(default_factory=list,max_length=4)
    layout:Literal['single','grid']='grid'
    position:Literal['right','bottom']='right'
    @model_validator(mode='after')
    def unique_cameras(self):
        if len(set(self.camera_ids))!=len(self.camera_ids):
            raise ValueError('카메라를 중복 선택할 수 없습니다.')
        if self.enabled and not self.camera_ids:
            raise ValueError('CCTV 위젯에 카메라를 하나 이상 선택하세요.')
        return self

class PanelConfig(Input):
    name:str=Field(min_length=2,max_length=80)
    line:Literal['A','B']
    location:str=Field(min_length=2,max_length=80)
    mode:Literal['tv','touch']='tv'
    resolution:Literal['1920x1080','1366x768','1280x800','1080x1920']='1920x1080'
    theme:Literal['dark','light']='dark'
    refresh_interval:int=Field(default=6,ge=5,le=60)
    rotation_enabled:bool=True
    screens:list[Screen]=Field(min_length=1,max_length=12)
    camera_widget:CameraWidget=Field(default_factory=CameraWidget)
    agent_widgets:list[str]=Field(default_factory=list,max_length=4)
    @field_validator('name','location')
    @classmethod
    def nonblank(cls,value):
        if len(value.strip())<2:raise ValueError('이름과 설치 위치를 2자 이상 입력하세요.')
        return value.strip()
    @model_validator(mode='after')
    def unique_screens(self):
        if len(set(s.id for s in self.screens))!=len(self.screens):
            raise ValueError('화면 ID는 고유해야 합니다.')
        return self

class PanelSave(Input):
    expected_revision:int=Field(ge=1)
    config:PanelConfig
class Target(Input):
    id:str
    expected_revision:int=Field(ge=1)
class BulkLayout(Input):
    agent_widgets:list[str]|None=Field(default=None,max_length=4)
    targets:list[Target]=Field(min_length=1,max_length=50)
    screens:list[Screen]=Field(min_length=1,max_length=12)
    theme:Literal['dark','light']
    refresh_interval:int=Field(ge=5,le=60)
    rotation_enabled:bool
class BulkPublish(Input):
    targets:list[Target]=Field(min_length=1,max_length=50)
class Publish(Input):
    expected_revision:int=Field(ge=1)
class Heartbeat(Input):
    screen_id:str=Field(max_length=60)
    revision:int=Field(ge=1)
class PanelEvent(Input):
    event_id:str=Field(min_length=1,max_length=80,pattern=r'^[a-zA-Z0-9_-]+$')
    action:Literal['support.request','work.acknowledge']
    reason:Literal['equipment','material','quality']|None=None
    order_id:str|None=Field(default=None,max_length=60)
class CameraConfig(Input):
    name:str=Field(min_length=2,max_length=80)
    line:Literal['A','B']
    location:str=Field(min_length=2,max_length=80)
    source_type:Literal['demo','hls','mp4','mjpeg']='demo'
    url:str=Field(default='',max_length=1500)
    enabled:bool=True
    fit:Literal['contain','cover']='cover'
    @model_validator(mode='after')
    def source_url(self):
        self.name=self.name.strip();self.location=self.location.strip();self.url=self.url.strip()
        if len(self.name)<2 or len(self.location)<2:raise ValueError('카메라 이름과 위치를 입력하세요.')
        if self.source_type=='demo':self.url='';return self
        parsed=urlsplit(self.url)
        if parsed.scheme not in ('https','http') or not parsed.hostname or parsed.username or parsed.password or any(c.isspace() for c in self.url):
            raise ValueError('HTTP(S) 재생 주소를 입력하세요. 주소에 사용자명·암호를 포함할 수 없습니다.')
        return self
class CameraSave(Input):
    expected_revision:int=Field(ge=1)
    config:CameraConfig
class CctvLayout(Input):
    enabled:bool=True
    minimized:bool=False
    camera_ids:list[str]=Field(default_factory=list,max_length=4)
    layout:Literal['single','grid']='grid'

def panel_row(db,pid,lock=False):
    row=db.scalar(select(Resource).where(Resource.id==pid,Resource.category=='panel').with_for_update() if lock else select(Resource).where(Resource.id==pid,Resource.category=='panel'))
    if not row:raise HTTPException(404,'패널을 찾을 수 없습니다.')
    return row

def camera_rows(db):
    return db.scalars(select(Resource).where(Resource.category=='camera').order_by(Resource.id)).all()

def camera_public(row):
    return {'id':row.id,**row.data}

def panel_public(row):
    data=row.data
    last=data.get('last_seen')
    online=bool(last and (datetime.now(timezone.utc)-datetime.fromisoformat(last)).total_seconds()<=max(data['draft']['refresh_interval']*3,30))
    return {'id':row.id,'draft':data['draft'],'published':data.get('published'),'revision':data['revision'],'published_revision':data.get('published_revision',0),'published_at':data.get('published_at'),'last_seen':last,'active_screen_id':data.get('active_screen_id'),'runtime_revision':data.get('runtime_revision'),'connection':'online' if online else 'offline' if last else 'unpaired','has_device_key':bool(data.get('device_token_hash')),'device_expires_at':data.get('device_expires_at')}

def validate_config(db,config):
    from .agent_widgets import validate_widgets
    if len(set(config.agent_widgets))!=len(config.agent_widgets):raise HTTPException(422,'에이전트 위젯을 중복 선택할 수 없습니다.')
    validate_widgets(db,config.agent_widgets)
    if not db.scalar(select(Asset.id).where(Asset.line==config.line).limit(1)):
        raise HTTPException(422,'이 라인에는 등록된 설비가 없습니다.')
    cameras={r.id:r for r in camera_rows(db)}
    for cid in config.camera_widget.camera_ids:
        camera=cameras.get(cid)
        if not camera or camera.data['line']!=config.line or not camera.data['enabled']:
            raise HTTPException(422,'패널과 같은 라인의 활성 카메라만 선택할 수 있습니다.')


def initialize_field_devices():
    from .seed import DEMO_MODE
    if not DEMO_MODE:return
    with SessionLocal() as db:
        if not db.scalar(select(Asset.id).limit(1)):return
        if not db.scalar(select(Resource.id).where(Resource.category=='camera').limit(1)):
            for line in ('A','B'):
                for i in (1,2):
                    config=CameraConfig(name=f'{line}라인 · {("제면 구역" if line=="A" else "스프 배합 구역") if i==1 else "포장·이송 구역"}',line=line,location=f'생산동 {line}-{i:02d}').model_dump()
                    db.add(Resource(id=f'CAM-{line}-{i:02d}',category='camera',name=config['name'],status='configured',data={**config,'revision':1}))
        if not db.scalar(select(Resource.id).where(Resource.category=='panel').limit(1)):
            for line in ('A','B'):
                for mode in ('tv','touch'):
                    templates=['production','equipment','quality','agents'] if mode=='tv' else ['work-order','andon','logistics']
                    screens=[Screen(id=f'screen-{t}',template=t,title={'production':'생산 현황','equipment':'설비 모니터링','quality':'품질 현황','work-order':'작업지시','andon':'현장 지원 요청','logistics':'물류 현황','agents':'공용 에이전트 현황'}[t],duration=20).model_dump() for t in templates]
                    config=PanelConfig(agent_widgets=['inventory','warehouse','lot','bom'] if mode=='tv' else [],name=f'{line}라인 {"생산 전광판" if mode=="tv" else "작업자 터치 패널"}',line=line,location=f'생산동 {line}라인 · {"입구" if mode=="tv" else "작업 셀"}',mode=mode,resolution='1920x1080' if mode=='tv' else '1280x800',rotation_enabled=mode=='tv',screens=screens,camera_widget=CameraWidget(enabled=mode=='tv',camera_ids=[f'CAM-{line}-01',f'CAM-{line}-02'])).model_dump()
                    db.add(Resource(id=f'PANEL-{line}-{mode.upper()}',category='panel',name=config['name'],status='published',data={'draft':config,'published':copy.deepcopy(config),'revision':1,'published_revision':1,'published_at':now()}))
        for row in db.scalars(select(Resource).where(Resource.category=='panel',Resource.id.in_(['PANEL-A-TV','PANEL-B-TV']))).all():
            data=copy.deepcopy(row.data)
            if data.get('agent_widgets_migrated'):continue
            for kind in ('draft','published'):
                config=data.get(kind)
                if config and not any(s['template']=='agents' for s in config['screens']) and len(config['screens'])<12:
                    config['screens'].append(Screen(id='screen-agents',template='agents',title='공용 에이전트 현황').model_dump());config['agent_widgets']=['inventory','warehouse','lot','bom']
                    data['revision' if kind=='draft' else 'published_revision']+=1
            data['agent_widgets_migrated']=True;row.data=data
        for camera in camera_rows(db):
            if '가공 구역' in camera.name:
                name=camera.name.replace('가공 구역','제면 구역' if camera.data['line']=='A' else '스프 배합 구역');camera.name=name;camera.data={**camera.data,'name':name}
        db.commit()


def snapshot(db,config,panel_id,revision,source):
    from .agent_widgets import widget_results
    from .industry import industry
    assets=db.scalars(select(Asset).where(Asset.line==config['line']).order_by(Asset.id)).all()
    ids=[a.id for a in assets]
    events=db.scalars(select(Telemetry).where(Telemetry.asset_id.in_(ids)).order_by(Telemetry.id.desc()).limit(300)).all()
    rows=db.scalars(select(Resource).where(Resource.category.in_(['order','alert','robot','job','panel_event']))).all()
    orders=[r for r in rows if r.category=='order' and r.data.get('line')==config['line']]
    alerts=[r for r in rows if r.category=='alert' and r.data.get('asset_id') in ids and r.status=='open']
    final_ids={a.id for a in assets if a.kind in ('QC','Packaging')}
    buckets={}
    for event in reversed(events):
        if event.asset_id not in final_ids:continue
        key=event.timestamp[:16]
        item=buckets.setdefault(key,{'time':event.timestamp,'good':0,'rejected':0})
        item['good']+=event.good;item['rejected']+=event.rejected
    simple=lambda r:{'id':r.id,'name':r.name,'status':r.status,'created_at':r.created_at,**r.data}
    cameras=[camera_public(r) for r in camera_rows(db) if r.data['enabled'] and r.data['line']==config['line'] and r.id in config['camera_widget']['camera_ids']]
    return {'panel_id':panel_id,'industry':industry(db)['config'],'agent_widgets':widget_results(db,config['line'],config.get('agent_widgets',[])),'config':config,'revision':revision,'source':source,'assets':[asset_dict(a) for a in assets],'orders':[simple(r) for r in orders],'alerts':[simple(r) for r in alerts],'robots':[simple(r) for r in rows if r.category=='robot'],'jobs':[simple(r) for r in rows if r.category=='job' and r.data.get('destination')==('제면 A라인' if config['line']=='A' else '스프 B라인')],'events':[simple(r) for r in sorted(rows,key=lambda r:r.created_at,reverse=True) if r.category=='panel_event' and r.data.get('line')==config['line']][:10],'series':list(buckets.values())[-24:],'cameras':cameras,'server_time':now(),'last_data_at':max((a.updated_at for a in assets),default=None)}


def device_or_user(db,row,credentials,write=False):
    if not credentials:raise HTTPException(401,'패널 연결 주소 또는 로그인이 필요합니다.')
    digest=hashlib.sha256(credentials.credentials.encode()).hexdigest()
    if row.data.get('device_token_hash') and secrets.compare_digest(row.data['device_token_hash'],digest):
        if datetime.fromisoformat(row.data['device_expires_at'])<=datetime.now(timezone.utc):raise HTTPException(401,'패널 연결 키가 만료되었습니다. 다시 발급하세요.')
        return f'panel:{row.id}'
    session=db.get(LoginSession,digest)
    if session and datetime.fromisoformat(session.expires_at)>datetime.now(timezone.utc):
        user=db.get(User,session.user_id)
        if user:
            if write and user.role not in ('admin','operator'):raise HTTPException(403,'현장 입력 권한이 없습니다.')
            return user.email
    raise HTTPException(401,'유효하지 않은 패널 연결 키입니다.')

@router.get('/cameras')
def cameras(user:User=Depends(current_user),db:Session=Depends(get_db)):
    return [camera_public(r) for r in camera_rows(db)]

@router.post('/cameras',status_code=201)
def create_camera(body:CameraConfig,user:User=Depends(roles('admin','operator')),db:Session=Depends(get_db)):
    row=add_resource(db,'camera',body.name,'configured',{**body.model_dump(),'revision':1})
    audit(db,user.email,'camera.create',row.id);db.commit();return camera_public(row)

@router.post('/cameras/{cid}')
def save_camera(cid:str,body:CameraSave,user:User=Depends(roles('admin','operator')),db:Session=Depends(get_db)):
    row=db.scalar(select(Resource).where(Resource.id==cid,Resource.category=='camera').with_for_update())
    if not row:raise HTTPException(404,'카메라를 찾을 수 없습니다.')
    if row.data['revision']!=body.expected_revision:raise HTTPException(409,'카메라 설정이 변경됐습니다. 새로고침 후 다시 저장하세요.')
    row.name=body.config.name;row.data={**body.config.model_dump(),'revision':row.data['revision']+1}
    audit(db,user.email,'camera.update',row.id);db.commit();return camera_public(row)

@router.get('/cctv/layout')
def get_layout(user:User=Depends(current_user),db:Session=Depends(get_db)):
    row=db.get(Resource,f'CCTV-LAYOUT-{user.id}')
    return row.data if row else CctvLayout(camera_ids=[r.id for r in camera_rows(db) if r.data['enabled']][:4]).model_dump()

@router.post('/cctv/layout')
def save_layout(body:CctvLayout,user:User=Depends(current_user),db:Session=Depends(get_db)):
    ids={r.id for r in camera_rows(db) if r.data['enabled']}
    if len(set(body.camera_ids))!=len(body.camera_ids) or any(cid not in ids for cid in body.camera_ids):raise HTTPException(422,'활성 카메라를 중복 없이 선택하세요.')
    rid=f'CCTV-LAYOUT-{user.id}';row=db.get(Resource,rid)
    if row:row.data=body.model_dump()
    else:db.add(Resource(id=rid,category='camera_layout',name=user.email,status='configured',data=body.model_dump()))
    db.commit();return body.model_dump()

@router.get('/panels')
def list_panels(user:User=Depends(current_user),db:Session=Depends(get_db)):
    return [panel_public(r) for r in db.scalars(select(Resource).where(Resource.category=='panel').order_by(Resource.id)).all()]

@router.post('/panels',status_code=201)
def create_panel(body:PanelConfig,user:User=Depends(roles('admin','operator')),db:Session=Depends(get_db)):
    validate_config(db,body)
    row=add_resource(db,'panel',body.name,'draft',{'draft':body.model_dump(),'published':None,'revision':1,'published_revision':0})
    audit(db,user.email,'panel.create',row.id);db.commit();return panel_public(row)

@router.post('/panels/preview')
def preview(body:PanelConfig,user:User=Depends(current_user),db:Session=Depends(get_db)):
    validate_config(db,body)
    return snapshot(db,body.model_dump(),'PREVIEW',0,'preview')

@router.post('/panels/bulk-layout')
def bulk_layout(body:BulkLayout,user:User=Depends(roles('admin','operator')),db:Session=Depends(get_db)):
    if len({t.id for t in body.targets})!=len(body.targets):raise HTTPException(422,'대상 패널을 중복 선택할 수 없습니다.')
    result=[]
    for target in sorted(body.targets,key=lambda t:t.id):
        row=panel_row(db,target.id,True)
        if row.data['revision']!=target.expected_revision:raise HTTPException(409,'대상 패널의 설정이 변경되었습니다. 전체 분배를 취소했습니다.')
        config=PanelConfig.model_validate({**row.data['draft'],'screens':[s.model_dump() for s in body.screens],'theme':body.theme,'refresh_interval':body.refresh_interval,'rotation_enabled':body.rotation_enabled,**({'agent_widgets':body.agent_widgets} if body.agent_widgets is not None else {})})
        validate_config(db,config)
        row.data={**row.data,'draft':config.model_dump(),'revision':row.data['revision']+1}
        result.append(row)
    audit(db,user.email,'panel.bulk_layout',','.join(r.id for r in result),{'count':len(result)});db.commit()
    return [panel_public(r) for r in result]

@router.post('/panels/bulk-publish')
def publish_many(body:BulkPublish,user:User=Depends(roles('admin')),db:Session=Depends(get_db)):
    if len({t.id for t in body.targets})!=len(body.targets):raise HTTPException(422,'대상 패널이 중복됩니다.')
    rows=[]
    for target in sorted(body.targets,key=lambda t:t.id):
        row=panel_row(db,target.id,True)
        if row.data['revision']!=target.expected_revision:raise HTTPException(409,'초안이 변경되어 전체 게시를 취소했습니다.')
        validate_config(db,PanelConfig.model_validate(row.data['draft']));rows.append(row)
    for row in rows:
        row.status='published';row.data={**row.data,'published':copy.deepcopy(row.data['draft']),'published_revision':row.data['revision'],'published_at':now()}
        audit(db,user.email,'panel.publish',row.id,{'revision':row.data['revision'],'bulk':True})
    db.commit();return [panel_public(row) for row in rows]

@router.post('/panels/{pid}/draft')
def save_panel(pid:str,body:PanelSave,user:User=Depends(roles('admin','operator')),db:Session=Depends(get_db)):
    row=panel_row(db,pid,True)
    if row.data['revision']!=body.expected_revision:raise HTTPException(409,'다른 사용자가 패널을 수정했습니다. 새로고침 후 다시 저장하세요.')
    validate_config(db,body.config);row.name=body.config.name
    row.data={**row.data,'draft':body.config.model_dump(),'revision':row.data['revision']+1}
    audit(db,user.email,'panel.save_draft',pid);db.commit();return panel_public(row)

@router.post('/panels/{pid}/publish')
def publish_panel(pid:str,body:Publish,user:User=Depends(roles('admin')),db:Session=Depends(get_db)):
    row=panel_row(db,pid,True)
    if row.data['revision']!=body.expected_revision:raise HTTPException(409,'초안이 변경되었습니다. 다시 확인하고 게시하세요.')
    validate_config(db,PanelConfig.model_validate(row.data['draft']))
    row.status='published';row.data={**row.data,'published':copy.deepcopy(row.data['draft']),'published_revision':row.data['revision'],'published_at':now()}
    audit(db,user.email,'panel.publish',pid,{'revision':row.data['revision']});db.commit();return panel_public(row)

@router.post('/panels/{pid}/access')
def provision(pid:str,user:User=Depends(roles('admin')),db:Session=Depends(get_db)):
    row=panel_row(db,pid,True)
    if not row.data.get('published'):raise HTTPException(409,'패널 설정을 먼저 게시하세요.')
    token=secrets.token_urlsafe(32);expires=(datetime.now(timezone.utc)+timedelta(days=30)).isoformat()
    row.data={**row.data,'device_token_hash':hashlib.sha256(token.encode()).hexdigest(),'device_expires_at':expires}
    audit(db,user.email,'panel.issue_access',pid);db.commit()
    return {'panel_id':pid,'access_token':token,'expires_at':expires}

@router.get('/panels/{pid}/display')
def display(pid:str,credentials=Depends(bearer),db:Session=Depends(get_db)):
    row=panel_row(db,pid);device_or_user(db,row,credentials)
    if not row.data.get('published'):raise HTTPException(409,'게시된 화면이 없습니다. 관리 콘솔에서 먼저 게시하세요.')
    return snapshot(db,row.data['published'],pid,row.data['published_revision'],'published')

@router.post('/panels/{pid}/heartbeat')
def heartbeat(pid:str,body:Heartbeat,credentials=Depends(bearer),db:Session=Depends(get_db)):
    row=panel_row(db,pid,True);device_or_user(db,row,credentials)
    if not row.data.get('published'):raise HTTPException(409,'게시된 화면이 없습니다.')
    # Stale clients can report their revision; this is not a deployment acknowledgement.
    row.data={**row.data,'last_seen':now(),'active_screen_id':body.screen_id,'runtime_revision':body.revision};db.commit();return {'ok':True}

@router.post('/panels/{pid}/events',status_code=201)
def panel_event(pid:str,body:PanelEvent,credentials=Depends(bearer),db:Session=Depends(get_db)):
    row=panel_row(db,pid,True);actor=device_or_user(db,row,credentials,write=True);config=row.data.get('published')
    if not config or config['mode']!='touch':raise HTTPException(403,'터치 패널의 게시 화면에서만 현장 입력이 가능합니다.')
    templates={s['template'] for s in config['screens']}
    if body.action=='support.request' and ('andon' not in templates or not body.reason):raise HTTPException(422,'지원 요청 화면과 요청 사유가 필요합니다.')
    if body.action=='work.acknowledge':
        order=db.get(Resource,body.order_id) if body.order_id else None
        if 'work-order' not in templates or not order or order.category!='order' or order.data['line']!=config['line'] or order.status!='running':raise HTTPException(422,'패널 라인의 진행 중인 작업지시만 확인할 수 있습니다.')
    rid=f'PE-{hashlib.sha256((pid+":"+body.event_id).encode()).hexdigest()[:40]}'
    existing=db.get(Resource,rid)
    if existing:return {'id':rid,'duplicate':True}
    db.add(Resource(id=rid,category='panel_event',name='현장 지원 요청' if body.action=='support.request' else '작업지시 확인',status='received',data={**body.model_dump(),'panel_id':pid,'line':config['line'],'actor':actor}))
    audit(db,actor,body.action,pid,{'event_id':rid,'line':config['line']});db.commit();return {'id':rid,'duplicate':False}
