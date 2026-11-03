"""Industry presentation and process profile, independent of supply-chain records."""
import copy
import json
from pathlib import Path
from typing import Literal
from fastapi import APIRouter,Depends,HTTPException
from pydantic import Field,model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import Resource,SessionLocal,User,get_db,now
from .schemas import Input
from .security import roles,current_user
from .services import audit

PROFILES=json.loads((Path(__file__).parent/'supply/profiles.json').read_text())
router=APIRouter(prefix='/api/industry',tags=['Industry & processes'])
class Line(Input):
    id:Literal['A','B']
    name:str=Field(min_length=2,max_length=60)
    description:str=Field(max_length=200)
    stages:list[str]=Field(min_length=1,max_length=10)
    @model_validator(mode='after')
    def valid(self):
        if any(not s.strip() or len(s)>40 for s in self.stages):raise ValueError('공정명은 1~40자로 입력하세요.')
        return self
class Profile(Input):
    id:Literal['ramen','general']
    name:str=Field(min_length=2,max_length=60)
    plant_name:str=Field(min_length=2,max_length=80)
    description:str=Field(max_length=500)
    lines:list[Line]=Field(min_length=2,max_length=2)
    @model_validator(mode='after')
    def valid(self):
        if {l.id for l in self.lines}!={'A','B'}:raise ValueError('A/B 라인은 고유해야 합니다.')
        return self
class SaveProfile(Input):
    expected_revision:int=Field(ge=1)
    config:Profile

def industry(db):
    row=db.get(Resource,'INDUSTRY-PROFILE')
    return copy.deepcopy(row.data) if row else {'revision':1,'config':copy.deepcopy(PROFILES[0])}

def initialize_industry():
    with SessionLocal() as db:
        if not db.get(Resource,'INDUSTRY-PROFILE'):
            db.add(Resource(id='INDUSTRY-PROFILE',category='industry',name='업종·공정 프로필',status='active',data={'revision':1,'config':copy.deepcopy(PROFILES[0])}));db.commit()

@router.get('')
def get_profile(user:User=Depends(current_user),db:Session=Depends(get_db)):
    return {**industry(db),'templates':PROFILES}
@router.post('')
def save_profile(body:SaveProfile,user:User=Depends(roles('admin')),db:Session=Depends(get_db)):
    row=db.scalar(select(Resource).where(Resource.id=='INDUSTRY-PROFILE').with_for_update())
    if row.data['revision']!=body.expected_revision:raise HTTPException(409,'업종 설정이 변경되었습니다. 새로고침하세요.')
    row.data={'revision':body.expected_revision+1,'config':body.config.model_dump(),'updated_at':now()}
    audit(db,user.email,'industry.configure',body.config.id,{'revision':row.data['revision']});db.commit()
    return {**row.data,'templates':PROFILES}
