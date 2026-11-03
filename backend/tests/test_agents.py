import json
from sqlalchemy import select
from app.db import SessionLocal,Resource
from app import agents

def test_multi_agent_line_diagnosis_and_human_approval(client,auth):
    h=auth();response=client.post('/api/agents/runs',headers=auth('operator'),json={'goal':'A라인의 설비 이상과 생산 상태를 진단해주세요.','line':'A','mode':'tools'})
    assert response.status_code==201
    rid=response.json()['id'];run=client.get('/api/agents/runs/'+rid,headers=h).json()
    assert run['status']=='awaiting_approval',run
    assert 'context' not in run
    assert len(run['tasks'])==8
    assert all(run['blackboard'].get(role) for role in ['planner','data','equipment','production','quality','logistics','main'])
    assert run['blackboard']['equipment']['maintenance_assets']==['CNC-003']
    assert all(a['id'] not in ['ASM-001','ASM-002'] for a in run['knowledge_graph']['nodes'])
    assert len(run['traces'])>=5
    assert run['blackboard']['production']['metrics']['scenario_ea']>run['blackboard']['production']['metrics']['baseline_ea']
    approval=run['approvals'][0]
    assert client.post('/api/recommendations/'+approval['id']+'/decision',headers=h,json={'decision':'approve'}).status_code==200
    assert client.get('/api/agents/runs/'+rid,headers=h).json()['status']=='completed'
    assert client.post('/api/agents/runs/'+rid+'/control',headers=h,json={'action':'cancel'}).status_code==409

def test_agent_roles_and_provider_requirements(client,auth,monkeypatch):
    viewer=auth('viewer');operator=auth('operator')
    body={'goal':'B라인 운영을 진단해주세요.','line':'B','mode':'tools'}
    assert client.post('/api/agents/runs',headers=viewer,json=body).status_code==403
    assert client.post('/api/agents/settings',headers=operator,json={'concurrency':4}).status_code==403
    assert client.post('/api/agents/settings',headers=auth(),json={'concurrency':4}).json()['concurrency']==4
    monkeypatch.delenv('LLM_MODEL',raising=False)
    assert client.post('/api/agents/runs',headers=auth(),json={**body,'mode':'ollama'}).status_code==409
    run=client.post('/api/agents/runs',headers=operator,json=body).json()
    result=client.get('/api/agents/runs/'+run['id'],headers=operator).json()
    assert result['status']=='completed'
    assert result['approvals']==[] and result['mode']=='tools'

def test_pause_resume_cancel_generation_and_recovery(client,auth,monkeypatch):
    h=auth();real=agents.execute_run
    monkeypatch.setattr(agents,'execute_run',lambda *args:None)
    run=client.post('/api/agents/runs',headers=h,json={'goal':'재개 가능한 라인 진단','line':'B'}).json();rid=run['id']
    assert client.post('/api/agents/runs/'+rid+'/control',headers=h,json={'action':'pause'}).json()['status']=='paused'
    assert client.post('/api/agents/runs/'+rid+'/control',headers=h,json={'action':'pause'}).status_code==409
    monkeypatch.setattr(agents,'execute_run',real)
    client.post('/api/agents/runs/'+rid+'/control',headers=h,json={'action':'resume'})
    assert client.get('/api/agents/runs/'+rid,headers=h).json()['status']=='completed'
    monkeypatch.setattr(agents,'execute_run',lambda *args:None)
    second=client.post('/api/agents/runs',headers=h,json={'goal':'서버 재시작 복구 진단','line':'B'}).json()
    agents.recover_agent_runs()
    assert client.get('/api/agents/runs/'+second['id'],headers=h).json()['status']=='paused'
    assert client.post('/api/agents/runs/'+second['id']+'/control',headers=h,json={'action':'cancel'}).json()['status']=='cancelled'

def test_optional_llm_adapter_with_reported_usage(client,auth,monkeypatch):
    monkeypatch.setenv('LLM_MODEL','test-local-model');monkeypatch.setenv('LLM_BASE_URL','http://local-llm.test:11434')
    calls=[]
    class FakeResponse:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self,*args):return json.dumps({'message':{'content':json.dumps({'summary':'도구에서 확인한 사실에 대한 모델 요약입니다.'})},'prompt_eval_count':20,'eval_count':12}).encode()
    def respond(request,timeout):
        body=json.loads(request.data);assert body['stream'] is False and body['format']=='json';calls.append(body);return FakeResponse()
    monkeypatch.setattr(agents.urllib.request,'urlopen',respond)
    h=auth();rid=client.post('/api/agents/runs',headers=h,json={'goal':'로컬 모델과 함께 라인 상태 진단','line':'B','mode':'ollama'}).json()['id']
    result=client.get('/api/agents/runs/'+rid,headers=h).json()
    assert result['status']=='completed' and len(calls)==4
    assert result['blackboard']['quality']['llm']['output_tokens']==12
    assert client.post('/api/agents/runs',headers=auth('operator'),json={'goal':'권한이 없는 모델 실행','line':'B','mode':'ollama'}).status_code==403

def test_llm_failure_is_visible_without_silent_fallback(client,auth,monkeypatch):
    monkeypatch.setenv('LLM_MODEL','test-local-model')
    def failed(*args):raise RuntimeError('unavailable')
    monkeypatch.setattr(agents,'ollama_summary',failed)
    h=auth();rid=client.post('/api/agents/runs',headers=h,json={'goal':'실패 상태 검증을 위한 진단','line':'B','mode':'ollama'}).json()['id']
    result=client.get('/api/agents/runs/'+rid,headers=h).json()
    assert result['status']=='failed' and result['error']
    assert result['mode']=='ollama'
