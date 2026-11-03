"""Read-only agent compositions installable on dashboards and field panels."""
import hashlib
from typing import Literal
from fastapi import APIRouter,Depends,HTTPException,Query
from pydantic import Field,model_validator
from sqlalchemy.orm import Session
from .db import Resource,User,get_db,now
from .security import current_user
from .schemas import Input
from .agent_registry import modules,plan_modules
from .agent_modules import execute

router=APIRouter(prefix='/api/agent-widgets',tags=['Installable agent widgets'])
DEFAULT_WIDGETS=['inventory','warehouse','lot','bom']
class WidgetLayout(Input):
    enabled:bool=True
    line:Literal['A','B']='A'
    module_ids:list[str]=Field(default_factory=lambda:DEFAULT_WIDGETS.copy(),max_length=4)
    @model_validator(mode='after')
    def valid(self):
        if len(set(self.module_ids))!=len(self.module_ids) or self.enabled and not self.module_ids:raise ValueError('위젯을 중복 없이 1~4개 선택하세요.')
        return self

def validate_widgets(db,ids,surface='panel'):
    items=modules(db)
    for mid in ids:
        module=next((m for m in items if m['id']==mid),None)
        if not module or not module['enabled'] or not module.get('compatible',True) or surface not in module.get('surfaces',[]):raise HTTPException(422,'현재 업종에서 사용 가능한 위젯 에이전트를 선택하세요.')

def widget_results(db,line,ids):
    from .agents import source_context
    items=modules(db);source=source_context(db,line);board={};results=[]
    for mid in ids:
        module=next((m for m in items if m['id']==mid),None)
        item={'id':mid,'name':module['name'] if module else mid,'captured_at':source['captured_at'],'line':line,'module_revision':module['revision'] if module else 0}
        if not module or not module['enabled'] or not module.get('compatible',True):results.append({**item,'status':'disabled','message':'현재 업종에서 사용 중지된 에이전트입니다.'});continue
        try:
            for dependency in plan_modules(items,[mid]):
                if dependency['id'] not in board:board[dependency['id']]=execute(dependency,source,board)
            results.append({**item,'status':'ready','fact':board[mid]})
        except (ValueError,HTTPException):results.append({**item,'status':'unavailable','message':'구성과 의존성을 확인하세요.'})
    return results

def key(user):return 'WIDGET-'+hashlib.sha256(user.email.encode()).hexdigest()[:40]
@router.get('/layout')
def get_layout(user:User=Depends(current_user),db:Session=Depends(get_db)):
    row=db.get(Resource,key(user));return row.data if row else WidgetLayout().model_dump()
@router.post('/layout')
def set_layout(body:WidgetLayout,user:User=Depends(current_user),db:Session=Depends(get_db)):
    validate_widgets(db,body.module_ids,'dashboard');row=db.get(Resource,key(user))
    if row:row.data=body.model_dump()
    else:db.add(Resource(id=key(user),category='agent_widget_layout',name='개인 에이전트 위젯',status='configured',data=body.model_dump()))
    db.commit();return body.model_dump()
@router.get('/results')
def results(line:Literal['A','B']='A',ids:str=Query(default='inventory,warehouse,lot,bom',max_length=200),user:User=Depends(current_user),db:Session=Depends(get_db)):
    selected=ids.split(',') if ids else []
    if len(selected)>4 or len(set(selected))!=len(selected):raise HTTPException(422,'위젯은 중복 없이 최대 4개입니다.')
    return widget_results(db,line,selected)
