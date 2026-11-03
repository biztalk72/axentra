from datetime import datetime, timezone, timedelta
from app.db import SessionLocal, Resource

def event(event_id='test-1',asset_id='NDL-MIX',**kwargs):
    return {'event_id':event_id,'asset_id':asset_id,'source':'test-edge','temperature':49,'vibration':1.2,'good':5,'rejected':0,**kwargs}

def test_health_auth_expiry_and_logout(client,auth):
    assert client.get('/health').json()['status']=='ok'
    assert client.get('/api/overview').status_code==401
    assert client.post('/api/auth/login',json={'email':'admin@admin.com','password':'bad'}).status_code==401
    h=auth()
    assert client.get('/api/auth/me',headers=h).json()['role']=='admin'
    assert client.post('/api/auth/logout',headers=h).status_code==200
    assert client.get('/api/auth/me',headers=h).status_code==401

def test_roles_enforced_server_side(client,auth):
    viewer=auth('viewer');operator=auth('operator')
    assert client.get('/api/overview',headers=viewer).status_code==200
    assert client.post('/api/demo/tick',json={},headers=viewer).status_code==403
    assert client.get('/api/audit',headers=operator).status_code==403
    assert client.post('/api/recommendations/REC-SEED/decision',json={'decision':'approve'},headers=operator).status_code==403
    assert client.post('/api/connectors',json={'name':'PLC','protocol':'OPC-UA','endpoint':'opc.tcp://localhost:4840'},headers=operator).status_code==403

def test_ingest_idempotency_and_out_of_order(client,auth):
    h=auth();before=next(a for a in client.get('/api/assets',headers=h).json() if a['id']=='NDL-MIX')
    response=client.post('/api/telemetry/batch',headers=h,json={'events':[event(),event()]})
    assert response.json()=={'accepted':1,'duplicates':1,'late':0}
    assert client.post('/api/telemetry/batch',headers=h,json={'events':[event()]}).json()['duplicates']==1
    old=datetime.now(timezone.utc)-timedelta(days=1)
    assert client.post('/api/telemetry/batch',headers=h,json={'events':[event('late',temperature=12,timestamp=old.isoformat())]}).json()['late']==1
    after=next(a for a in client.get('/api/assets',headers=h).json() if a['id']=='NDL-MIX')
    assert after['produced']==before['produced']+10
    assert after['temperature']==49

def test_ingest_batch_is_atomic_and_validated(client,auth):
    h=auth();before=client.get('/api/overview',headers=h).json()['kpis']['events']
    future=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
    assert client.post('/api/telemetry/batch',headers=h,json={'events':[event(),event('future',timestamp=future)]}).status_code==422
    assert client.get('/api/overview',headers=h).json()['kpis']['events']==before
    assert client.post('/api/telemetry/batch',headers=h,json={'events':[event(asset_id='UNKNOWN')]}).status_code==404
    assert client.post('/api/telemetry/batch',headers=h,json={'events':[event(temperature=300)]}).status_code==422
    assert client.post('/api/telemetry/batch',headers=h,json={'events':[event(good=-1)]}).status_code==422

def test_anomaly_produces_explainable_recommendation(client,auth):
    h=auth()
    client.post('/api/telemetry/batch',headers=h,json={'events':[event(temperature=88)]})
    rec=client.get('/api/resources/recommendation',headers=h).json()
    assert any(r['asset_id']=='NDL-MIX' and r['engine']=='threshold-rule-v1' for r in rec)
    assert next(a for a in client.get('/api/assets',headers=h).json() if a['id']=='NDL-MIX')['status']=='warning'

def test_approval_atomic_exactly_one_task_and_audit(client,auth):
    h=auth();endpoint='/api/recommendations/REC-SEED/decision'
    response=client.post(endpoint,headers=h,json={'decision':'approve'})
    assert response.status_code==200
    assert response.json()['status']=='approved'
    assert client.post(endpoint,headers=h,json={'decision':'approve'}).status_code==409
    assert len(client.get('/api/resources/maintenance',headers=h).json())==1
    assert any(a['action']=='recommendation.approve' for a in client.get('/api/audit',headers=h).json())

def test_rejection_does_not_create_work(client,auth):
    h=auth();r=client.post('/api/recommendations/REC-SEED/decision',headers=h,json={'decision':'reject'})
    assert r.json()['status']=='rejected'
    assert client.get('/api/resources/maintenance',headers=h).json()==[]

def test_simulator_and_dataset_flow(client,auth):
    h=auth();response=client.post('/api/simulations',headers=h,json={'cycle_reduction':15,'downtime':5,'hours':8,'defect_rate':1.5})
    assert response.status_code==201
    s=response.json();assert s['bottleneck']=='NDL-STEAM'
    assert s['optimized']>s['baseline']
    assert client.post('/api/simulations',headers=h,json={'cycle_reduction':101}).status_code==422
    d=client.post('/api/datasets',headers=h,json={'simulation_id':s['id'],'samples':35}).json()
    csv=client.get(f'/api/datasets/{d["id"]}/download',headers=h)
    assert csv.status_code==200 and len(csv.text.strip().splitlines())==36
    assert csv.headers['content-type'].startswith('text/csv')
    assert client.post('/api/datasets',headers=h,json={'simulation_id':'bad','samples':20}).status_code==404

def test_train_deploy_infer_and_archive(client,auth):
    h=auth();operator=auth('operator')
    m=client.post('/api/models/train',headers=h,json={}).json()
    assert m['samples']>=20 and m['train_samples']+m['holdout_samples']==m['samples']
    assert client.get(f'/api/models/{m["id"]}/inference',headers=h).status_code==409
    assert client.post(f'/api/models/{m["id"]}/deploy',headers=operator).status_code==403
    assert client.post(f'/api/models/{m["id"]}/deploy',headers=h).json()['status']=='deployed'
    inference=client.get(f'/api/models/{m["id"]}/inference',headers=h).json()
    assert inference['anomaly'] is True
    second=client.post('/api/models/train',headers=h,json={}).json()
    client.post(f'/api/models/{second["id"]}/deploy',headers=h)
    models=client.get('/api/resources/model',headers=h).json()
    assert sum(m['status']=='deployed' for m in models)==1
    assert next(x for x in models if x['id']==m['id'])['status']=='archived'

def test_robot_job_state_machine(client,auth):
    h=auth();payload={'robot_id':'AMR-001','destination':'제면 A라인'}
    job=client.post('/api/robot-jobs',headers=h,json=payload).json()
    assert job['status']=='running' and job['mode']=='virtual'
    assert client.post('/api/robot-jobs',headers=h,json=payload).status_code==409
    assert client.post(f'/api/robot-jobs/{job["id"]}/complete',headers=h).json()['status']=='completed'
    assert client.post(f'/api/robot-jobs/{job["id"]}/complete',headers=h).status_code==409
    robot=next(r for r in client.get('/api/resources/robot',headers=h).json() if r['name']=='AMR-001')
    assert robot['status']=='idle' and robot['battery']==83 and robot['location']=='제면 A라인'

def test_finished_goods_only_count_final_station(client,auth):
    h=auth();before=next(o for o in client.get('/api/resources/order',headers=h).json() if o['line']=='A' and o['status']=='running')['completed']
    client.post('/api/telemetry/batch',headers=h,json={'events':[event('process'),event('final',asset_id='NDL-PACK')]})
    after=next(o for o in client.get('/api/resources/order',headers=h).json() if o['line']=='A' and o['status']=='running')['completed']
    assert after==before+5

def test_order_line_mutual_exclusion(client,auth):
    h=auth();order=client.post('/api/orders',headers=h,json={'name':'추가 생산','product':'모터 하우징','quantity':100,'line':'A'}).json()
    assert client.post(f'/api/orders/{order["id"]}/start',headers=h).status_code==409
    with SessionLocal() as db:
        active=db.get(Resource,'WO-2601');active.status='completed';db.commit()
    assert client.post(f'/api/orders/{order["id"]}/start',headers=h).json()['status']=='running'

def test_config_and_exports_persist(client,auth):
    h=auth();c=client.post('/api/connectors',headers=h,json={'name':'현장 OPC','protocol':'OPC-UA','endpoint':'opc.tcp://gateway:4840'}).json()
    assert c['status']=='configured' and c['driver']=='unconfigured'
    assert any(x['id']==c['id'] for x in client.get('/api/resources/connector',headers=h).json())
    assert client.get('/api/telemetry/export',headers=h).text.startswith('id,asset_id,temperature')
    assert client.get('/metrics',headers=auth('viewer')).status_code==403
    assert 'forge_http_requests_total' in client.get('/metrics',headers=h).text

def test_expired_session_rejected(client,auth):
    from sqlalchemy import select
    from app.db import LoginSession
    h=auth()
    with SessionLocal() as db:
        session=db.scalar(select(LoginSession))
        session.expires_at=(datetime.now(timezone.utc)-timedelta(minutes=1)).isoformat()
        db.commit()
    assert client.get('/api/auth/me',headers=h).status_code==401

def test_concurrent_approval_postgresql(client,auth):
    import pytest
    from concurrent.futures import ThreadPoolExecutor
    from app.db import engine
    if engine.dialect.name!='postgresql':
        pytest.skip('PostgreSQL transaction concurrency check')
    h=auth()
    def approve(_):
        return client.post('/api/recommendations/REC-SEED/decision',headers=h,json={'decision':'approve'}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(approve,range(2)))==[200,409]
    assert len(client.get('/api/resources/maintenance',headers=h).json())==1

def test_concurrent_robot_dispatch_postgresql(client,auth):
    import pytest
    from concurrent.futures import ThreadPoolExecutor
    from app.db import engine
    if engine.dialect.name!='postgresql':
        pytest.skip('PostgreSQL row lock check')
    h=auth()
    def dispatch(_):
        return client.post('/api/robot-jobs',headers=h,json={'robot_id':'AMR-001','destination':'제면 A라인'}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(dispatch,range(2)))==[201,409]
    assert len(client.get('/api/resources/job',headers=h).json())==1
