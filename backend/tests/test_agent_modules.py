import copy
from sqlalchemy import select,func
from app.db import SessionLocal,Resource
from app import agents
from app.agent_modules import HANDLERS


def config(module,**patch):
    return {**{k:copy.deepcopy(module[k]) for k in ('name','description','enabled','depends','instruction','parameters')},**patch}

def find(client,h,mid):
    return next(m for m in client.get('/api/agents/modules',headers=h).json() if m['id']==mid)

def test_registry_covers_all_features_and_independent_results(client,auth):
    h=auth();items=client.get('/api/agents/modules',headers=h).json()
    assert len(items)==13 and len(HANDLERS)==13
    rid=client.post('/api/agents/runs',headers=h,json={'goal':'전체 기능 모듈 진단','line':'A'}).json()['id']
    result=client.get('/api/agents/runs/'+rid,headers=h).json()
    assert {m['id'] for m in items}<=set(result['blackboard'])
    assert len(result['modules'])==13
    assert all(m['revision']==1 and m['version']=='1.0.0' for m in result['modules'])
    assert result['blackboard']['cctv']['metrics']['demo_cameras']==2
    assert result['blackboard']['panels']['metrics']['panels']==2


def test_module_updates_are_versioned_validated_and_admin_only(client,auth):
    h=auth();m=find(client,h,'equipment');body={'expected_revision':1,'config':config(m,name='정밀 설비 진단',parameters={'temperature_threshold':80,'vibration_threshold':4})}
    assert client.post('/api/agents/modules/equipment',headers=auth('operator'),json=body).status_code==403
    updated=client.post('/api/agents/modules/equipment',headers=h,json=body).json()
    assert updated['revision']==2 and updated['history'][0]['parameters']['temperature_threshold']==75
    assert client.post('/api/agents/modules/equipment',headers=h,json=body).status_code==409
    bad={'expected_revision':2,'config':config(updated,parameters={'temperature_threshold':999,'vibration_threshold':4})}
    assert client.post('/api/agents/modules/equipment',headers=h,json=bad).status_code==422
    assert find(client,h,'equipment')['revision']==2
    assert client.post('/api/agents/modules/equipment',headers=h,json={**body,'config':{**body['config'],'tool':'shell.exec'}}).status_code==422


def test_graph_rejects_cycles_disabled_dependencies_and_core_disable(client,auth):
    h=auth();m=find(client,h,'production')
    assert client.post('/api/agents/modules/production',headers=h,json={'expected_revision':1,'config':config(m,depends=['simulation'])}).status_code==422
    assert client.post('/api/agents/modules/production',headers=h,json={'expected_revision':1,'config':config(m,enabled=False)}).status_code==422
    data=find(client,h,'data')
    assert client.post('/api/agents/modules/data',headers=h,json={'expected_revision':1,'config':config(data,enabled=False)}).status_code==422
    assert client.post('/api/agents/modules/production',headers=h,json={'expected_revision':1,'config':config(m,depends=['unknown'])}).status_code==422


def test_custom_configuration_reuses_allowed_tool_and_dependency_closure(client,auth):
    h=auth();m=find(client,h,'cctv');body={**config(m), 'id':'camera-review','template_id':'cctv','name':'라인 영상 설정 검토'}
    assert client.post('/api/agents/modules',headers=h,json={**body,'id':'main'}).status_code==422
    response=client.post('/api/agents/modules',headers=h,json=body)
    assert response.status_code==201 and response.json()['builtin'] is False
    assert client.post('/api/agents/modules',headers=h,json=body).status_code==409
    rid=client.post('/api/agents/runs',headers=h,json={'goal':'선택 기능만 진단합니다.','line':'A','agent_ids':['camera-review']}).json()['id']
    result=client.get('/api/agents/runs/'+rid,headers=h).json()
    assert {t['id'] for t in result['tasks']}=={'planner','data','panels','camera-review','main','approval'}
    assert result['approvals']==[] and result['status']=='completed'
    for ids in ([],['unknown'],['cctv','cctv']):
        assert client.post('/api/agents/runs',headers=h,json={'goal':'잘못된 실행 선택 검증','line':'A','agent_ids':ids}).status_code==422


def test_run_freezes_module_configuration_before_later_edits(client,auth,monkeypatch):
    h=auth();real=agents.execute_run
    monkeypatch.setattr(agents,'execute_run',lambda *args:None)
    rid=client.post('/api/agents/runs',headers=h,json={'goal':'실행 구성 고정 검증','line':'A','agent_ids':['equipment']}).json()['id']
    m=find(client,h,'equipment');params={'temperature_threshold':200,'vibration_threshold':100}
    client.post('/api/agents/modules/equipment',headers=h,json={'expected_revision':1,'config':config(m,parameters=params)})
    monkeypatch.setattr(agents,'execute_run',real)
    real(rid,1)
    first=client.get('/api/agents/runs/'+rid,headers=h).json()
    assert first['blackboard']['equipment']['metrics']['warnings']==1
    assert next(m for m in first['modules'] if m['id']=='equipment')['revision']==1
    rid2=client.post('/api/agents/runs',headers=h,json={'goal':'수정된 구성으로 진단','line':'A','agent_ids':['equipment']}).json()['id']
    second=client.get('/api/agents/runs/'+rid2,headers=h).json()
    assert second['blackboard']['equipment']['metrics']['warnings']==0 and second['approvals']==[]


def test_preview_is_read_only_and_does_not_use_llm_or_create_work(client,auth,monkeypatch):
    h=auth();m=find(client,h,'equipment');viewer=auth('viewer')
    def no_llm(*args):raise AssertionError('preview called LLM')
    monkeypatch.setattr(agents,'ollama_summary',no_llm)
    with SessionLocal() as db:
        before=db.scalar(select(func.count()).select_from(Resource))
    result=client.post('/api/agents/modules/equipment/preview',headers=viewer,json=config(m,parameters={'temperature_threshold':200,'vibration_threshold':100})).json()
    assert result['preview'] and result['line_results']['A']['metrics']['warnings']==0
    with SessionLocal() as db:
        after=db.scalar(select(func.count()).select_from(Resource))
    assert after==before and find(client,h,'equipment')['revision']==1
