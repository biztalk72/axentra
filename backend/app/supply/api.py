import copy
import json
import threading
from datetime import date,datetime,timedelta,timezone
from decimal import Decimal
from pathlib import Path
from typing import Literal
from fastapi import APIRouter,Depends,HTTPException
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..db import Resource,SessionLocal,User,get_db,now
from ..schemas import Input
from ..security import roles,current_user
from ..services import audit
from .engine import transact,public_state,production_plan,trace

router=APIRouter(prefix='/api/supply',tags=['Inventory · warehouse · LOT · BOM'])
_lock=threading.RLock()
Id=str
class Sku(Input):
    id:str=Field(pattern=r'^[A-Z0-9][A-Z0-9_-]{0,29}$')
    name:str=Field(min_length=2,max_length=80)
    category:Literal['raw','wip','finished','packaging']
    unit:Literal['kg','ea','box']
    min_stock:Decimal=Field(default=Decimal(0),ge=0,le=1000000000,decimal_places=3)
    expected_revision:int|None=Field(default=None,ge=1)
class Location(Input):
    id:str=Field(pattern=r'^[A-Z0-9][A-Z0-9_-]{0,29}$')
    warehouse:str=Field(min_length=2,max_length=60)
    zone:str=Field(min_length=2,max_length=60)
    name:str=Field(min_length=2,max_length=80)
    allowed_categories:list[Literal['raw','wip','finished','packaging']]=Field(min_length=1,max_length=4)
    expected_revision:int|None=Field(default=None,ge=1)
class Component(Input):
    sku_id:str=Field(max_length=30)
    quantity:Decimal=Field(gt=0,le=1000000000,decimal_places=3)
class Bom(Input):
    product_sku_id:str=Field(max_length=30)
    name:str=Field(min_length=2,max_length=80)
    output_quantity:Decimal=Field(gt=0,le=1000000000,decimal_places=3)
    components:list[Component]=Field(min_length=1,max_length=30)
    expected_revision:int|None=Field(default=None,ge=1)
class LotStatus(Input):
    lot_id:str=Field(max_length=60)
    expected_revision:int=Field(ge=1)
    status:Literal['released','quarantine','blocked']
class Receipt(Input):
    event_id:str=Field(min_length=1,max_length=80,pattern=r'^[a-zA-Z0-9_-]+$')
    sku_id:str=Field(max_length=30)
    lot_code:str=Field(min_length=1,max_length=60)
    quantity:Decimal=Field(gt=0,le=1000000000,decimal_places=3)
    to_location:str=Field(max_length=30)
    manufactured_on:date|None=None
    expires_on:date|None=None
    supplier:str=Field(default='',max_length=80)
    reference:str=Field(default='',max_length=200)
class Issue(Input):
    event_id:str=Field(min_length=1,max_length=80,pattern=r'^[a-zA-Z0-9_-]+$')
    lot_id:str=Field(max_length=60)
    from_location:str=Field(max_length=30)
    quantity:Decimal=Field(gt=0,le=1000000000,decimal_places=3)
    reference:str=Field(default='',max_length=200)
class Transfer(Issue):
    to_location:str=Field(max_length=30)
class Plan(Input):
    bom_id:str=Field(max_length=40)
    bom_revision:int=Field(ge=1)
    quantity:Decimal=Field(gt=0,le=1000000000,decimal_places=3)
class Allocation(Input):
    lot_id:str=Field(max_length=60)
    from_location:str=Field(max_length=30)
    quantity:Decimal=Field(gt=0,le=1000000000,decimal_places=3)
class Produce(Plan):
    event_id:str=Field(min_length=1,max_length=80,pattern=r'^[a-zA-Z0-9_-]+$')
    lot_code:str=Field(min_length=1,max_length=60)
    to_location:str=Field(max_length=30)
    expires_on:date|None=None
    reference:str=Field(default='',max_length=200)
    allocations:list[Allocation]=Field(min_length=1,max_length=100)

def empty_state():return {'version':1,'revision':1,'sequence':0,'skus':[],'locations':[],'lots':[],'balances':[],'boms':[],'movements':[],'batches':[],'events':{}}

def seed_state():
    seed=json.loads(Path(__file__).with_name('seed.json').read_text());state=empty_state();stamp=now();today=datetime.now(timezone.utc).date()
    def apply(command,body):
        nonlocal state
        state,result=transact(state,command,body,stamp);return result
    for sku in seed['skus']:apply('sku',sku)
    for location in seed['locations']:apply('location',location)
    for bom in seed['boms']:apply('bom',bom)
    for i,r in enumerate(seed['receipts']):
        body={k:v for k,v in r.items() if k!='expires_in_days'};body.update(event_id=f'seed-receipt-{i}',manufactured_on=(today-timedelta(days=1)).isoformat(),expires_on=(today+timedelta(days=r['expires_in_days'])).isoformat(),supplier='합성 데모 공급처',reference='라면 제조 데모 초기 입고')
        apply('receipt',body)
        lot=next(l for l in state['lots'] if l['sku_id']==r['sku_id'] and l['code']==r['lot_code'])
        if not r['lot_code'].endswith('HOLD'):apply('lot-status',{'lot_id':lot['id'],'expected_revision':1,'status':'released'})
    for i,p in enumerate(seed['production']):
        bom=next(b for b in state['boms'] if b['product_sku_id']==p['product']);body={'bom_id':bom['id'],'bom_revision':1,'quantity':p['quantity']};plan=production_plan(state,body,today.isoformat())
        result=apply('produce',{**body,'event_id':f'seed-produce-{i}','lot_code':p['product']+'-DEMO-01','to_location':p['to_location'],'expires_on':(today+timedelta(days=p['expires_in_days'])).isoformat(),'allocations':plan['allocations'],'reference':'합성 데모 생산'})
        apply('lot-status',{'lot_id':result['lot_id'],'expected_revision':1,'status':'released'})
    return state

def initialize_supply():
    from ..seed import DEMO_MODE
    with SessionLocal() as db:
        if not db.get(Resource,'SUPPLY-STATE'):
            db.add(Resource(id='SUPPLY-STATE',category='supply_state',name='공통 공급망 원장',status='active',data=seed_state() if DEMO_MODE else empty_state()));db.commit()

def state_for(db):
    row=db.get(Resource,'SUPPLY-STATE')
    return copy.deepcopy(row.data) if row else empty_state()

def mutate(db,user,command,body):
    with _lock:
        row=db.scalar(select(Resource).where(Resource.id=='SUPPLY-STATE').with_for_update())
        updated,result=transact(row.data,command,body.model_dump(mode='json'),now())
        if not result.get('duplicate'):
            from ..integrations import enqueue
            enqueue(db,'supply.'+command,str(result.get('lot_id') or result.get('id') or result.get('batch_id') or command),result)
            row.data=updated;audit(db,user.email,'supply.'+command,result.get('id') or result.get('batch_id'),{'revision':updated['revision'],'event_id':getattr(body,'event_id',None)})
        db.commit();return result

@router.get('')
def overview(user:User=Depends(current_user),db:Session=Depends(get_db)):
    return public_state(state_for(db))
@router.post('/skus')
def sku(body:Sku,user:User=Depends(roles('admin')),db:Session=Depends(get_db)):return mutate(db,user,'sku',body)
@router.post('/locations')
def location(body:Location,user:User=Depends(roles('admin')),db:Session=Depends(get_db)):return mutate(db,user,'location',body)
@router.post('/boms')
def bom(body:Bom,user:User=Depends(roles('admin')),db:Session=Depends(get_db)):return mutate(db,user,'bom',body)
@router.post('/lot-status')
def status(body:LotStatus,user:User=Depends(roles('admin')),db:Session=Depends(get_db)):return mutate(db,user,'lot-status',body)
@router.post('/receipts')
def receipt(body:Receipt,user:User=Depends(roles('admin','operator')),db:Session=Depends(get_db)):return mutate(db,user,'receipt',body)
@router.post('/issues')
def issue(body:Issue,user:User=Depends(roles('admin','operator')),db:Session=Depends(get_db)):return mutate(db,user,'issue',body)
@router.post('/transfers')
def transfer(body:Transfer,user:User=Depends(roles('admin','operator')),db:Session=Depends(get_db)):return mutate(db,user,'transfer',body)
@router.post('/production-preview')
def preview(body:Plan,user:User=Depends(current_user),db:Session=Depends(get_db)):return production_plan(state_for(db),body.model_dump(mode='json'),now()[:10])
@router.post('/production')
def produce(body:Produce,user:User=Depends(roles('admin','operator')),db:Session=Depends(get_db)):return mutate(db,user,'produce',body)
@router.get('/lots/{lid}/trace')
def lot_trace(lid:str,user:User=Depends(current_user),db:Session=Depends(get_db)):return trace(state_for(db),lid)
