"""Versioned configuration and dependency planning for independent agent modules."""
import copy
import math
import threading
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .agent_modules import CATALOG, execute
from .db import Resource, SessionLocal, User, get_db, now
from .schemas import Input
from .security import current_user, roles
from .services import audit

router=APIRouter(prefix='/api/agents/modules',tags=['Agent modules'])
registry_lock=threading.RLock()
BUILTINS={m['id']:m for m in CATALOG}
EDITABLE=('name','description','enabled','depends','instruction','parameters')

class ModuleConfig(Input):
    name:str=Field(min_length=2,max_length=80)
    description:str=Field(max_length=500)
    enabled:bool=True
    depends:list[str]=Field(default_factory=list,max_length=31)
    instruction:str=Field(default='',max_length=2000)
    parameters:dict[str,Any]=Field(default_factory=dict)
class ModuleSave(Input):
    expected_revision:int=Field(ge=1)
    config:ModuleConfig
class ModuleCreate(ModuleConfig):
    id:str=Field(pattern=r'^[a-z][a-z0-9_-]{1,39}$')
    template_id:str


def initialize_agent_registry():
    with SessionLocal() as db:
        if not db.get(Resource,'AGENT-MODULES'):
            db.add(Resource(id='AGENT-MODULES',category='agent_registry',name='Agent module registry',status='ready',data={}))
            db.commit()


def modules(db):
    items={m['id']:{**copy.deepcopy(m),'builtin':True,'revision':1,'history':[]} for m in CATALOG}
    for row in db.scalars(select(Resource).where(Resource.category=='agent_module')).all():
        saved=copy.deepcopy(row.data)
        template=next((m for m in CATALOG if m['tool']==saved['tool']),None)
        if template:
            for key in ('version','category','parameter_specs'):saved[key]=copy.deepcopy(template[key])
        items[saved['id']]=saved
    return list(items.values())


def validate_module(candidate,items):
    if not candidate['name'].strip() or len(candidate['name'].strip())<2:
        raise HTTPException(422,'에이전트 이름을 2자 이상 입력하세요.')
    if candidate['id']=='data' and (not candidate['enabled'] or candidate['depends']):
        raise HTTPException(422,'공통 데이터 에이전트는 활성 상태와 빈 의존성을 유지해야 합니다.')
    specs={p['key']:p for p in candidate['parameter_specs']}
    if set(candidate['parameters'])!=set(specs):raise HTTPException(422,'허용된 매개변수를 모두 입력하세요.')
    for key,value in candidate['parameters'].items():
        spec=specs[key]
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not spec['min']<=value<=spec['max']:
            raise HTTPException(422,f"{spec['label']} 값은 {spec['min']}~{spec['max']} 범위여야 합니다.")
    if len(set(candidate['depends']))!=len(candidate['depends']):raise HTTPException(422,'의존 에이전트를 중복 선택할 수 없습니다.')
    graph={m['id']:m for m in items};graph[candidate['id']]=candidate
    if len(graph)>32:raise HTTPException(422,'에이전트는 최대 32개입니다.')
    visited=set();stack=set()
    def visit(mid):
        if mid in stack:raise HTTPException(422,'순환 의존성은 허용되지 않습니다.')
        if mid in visited:return
        stack.add(mid);m=graph[mid]
        for dep in m['depends']:
            if dep not in graph:raise HTTPException(422,'존재하지 않는 의존 에이전트입니다.')
            if m['enabled'] and not graph[dep]['enabled']:raise HTTPException(422,f"{m['name']}에 필요한 {graph[dep]['name']}를 먼저 활성화하세요.")
            visit(dep)
        stack.remove(mid);visited.add(mid)
    for mid in graph:visit(mid)
    return candidate


def plan_modules(items,requested=None):
    graph={m['id']:m for m in items}; selected=set(); visiting=set()
    if requested is not None and (not requested or len(set(requested))!=len(requested)):
        raise HTTPException(422,'실행할 에이전트를 중복 없이 하나 이상 선택하세요.')
    def add(mid):
        if mid in visiting:raise HTTPException(422,'순환 의존성입니다.')
        if mid not in graph or not graph[mid]['enabled']:raise HTTPException(422,'없거나 비활성화된 에이전트입니다.')
        if mid in selected:return
        visiting.add(mid)
        for dep in graph[mid]['depends']:add(dep)
        visiting.remove(mid);selected.add(mid)
    add('data')
    for mid in requested if requested is not None else [m['id'] for m in items if m['enabled']]:add(mid)
    # Stable topological order, also used by the browser adapter.
    result=[]; pending=[m for m in items if m['id'] in selected]
    while pending:
        ready=[m for m in pending if all(d in {r['id'] for r in result} for d in m['depends'])]
        if not ready:raise HTTPException(422,'실행 의존성을 구성할 수 없습니다.')
        result.extend(copy.deepcopy(ready));pending=[m for m in pending if m not in ready]
    for module in result:validate_module(module,items)
    return result


def module_candidate(base,config):
    data=copy.deepcopy(base)
    data.update(config.model_dump());data['name']=data['name'].strip()
    return data

@router.get('')
def list_modules(user:User=Depends(current_user),db:Session=Depends(get_db)):
    return modules(db)

@router.post('',status_code=201)
def create_module(body:ModuleCreate,user:User=Depends(roles('admin')),db:Session=Depends(get_db)):
    with registry_lock:
        db.scalar(select(Resource).where(Resource.id=='AGENT-MODULES').with_for_update())
        items=modules(db)
        if body.id in ('planner','main','approval','constructor','prototype'):raise HTTPException(422,'실행 제어용 예약 ID는 사용할 수 없습니다.')
        if any(m['id']==body.id for m in items):raise HTTPException(409,'이미 사용 중인 에이전트 ID입니다.')
        if body.template_id not in BUILTINS:raise HTTPException(422,'등록된 기본 모듈을 선택하세요.')
        base={**copy.deepcopy(BUILTINS[body.template_id]),'id':body.id,'builtin':False,'revision':1,'history':[],'template_id':body.template_id}
        config=ModuleConfig(**{k:getattr(body,k) for k in EDITABLE})
        data=validate_module(module_candidate(base,config),items);data['updated_at']=now()
        db.add(Resource(id='AGENT-MOD-'+body.id,category='agent_module',name=data['name'],status='configured',data=data))
        audit(db,user.email,'agent_module.create',body.id,{'revision':1,'tool':data['tool']})
        try:db.commit()
        except IntegrityError:db.rollback();raise HTTPException(409,'에이전트 등록이 충돌했습니다. 목록을 갱신하세요.')
        return data

@router.post('/{mid}')
def save_module(mid:str,body:ModuleSave,user:User=Depends(roles('admin')),db:Session=Depends(get_db)):
    with registry_lock:
        db.scalar(select(Resource).where(Resource.id=='AGENT-MODULES').with_for_update())
        items=modules(db);base=next((m for m in items if m['id']==mid),None)
        if not base:raise HTTPException(404,'에이전트 모듈을 찾을 수 없습니다.')
        if base['revision']!=body.expected_revision:raise HTTPException(409,'다른 변경이 저장되었습니다. 목록을 갱신하세요.')
        data=validate_module(module_candidate(base,body.config),items)
        history={k:copy.deepcopy(base[k]) for k in (*EDITABLE,'revision')};history['saved_at']=base.get('updated_at')
        data['history']=(base['history']+[history])[-20:];data['revision']+=1;data['updated_at']=now()
        row=db.get(Resource,'AGENT-MOD-'+mid)
        if row:row.data=data;row.name=data['name']
        else:db.add(Resource(id='AGENT-MOD-'+mid,category='agent_module',name=data['name'],status='configured',data=data))
        audit(db,user.email,'agent_module.update',mid,{'revision':data['revision']})
        db.commit();return data

@router.post('/{mid}/preview')
def preview_module(mid:str,body:ModuleConfig,user:User=Depends(current_user),db:Session=Depends(get_db)):
    # No writes, no LLM calls and no maintenance requests.
    from .agents import source_context
    items=modules(db);base=next((m for m in items if m['id']==mid),None)
    if not base:raise HTTPException(404,'에이전트 모듈을 찾을 수 없습니다.')
    candidate=validate_module(module_candidate(base,body),items)
    return {'module_id':mid,'preview':True,'line_results':{line:execute(candidate,source_context(db,line),{}) for line in ('A','B')}}
