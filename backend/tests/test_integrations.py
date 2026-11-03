from sqlalchemy import select,func
from app.db import SessionLocal,Resource
from app import integrations

def count():
    with SessionLocal() as db:return db.scalar(select(func.count()).select_from(Resource).where(Resource.category=='integration_event'))

def test_governed_exports_and_permissions(client,auth):
    h=auth('viewer');c=client.get('/api/integrations/catalog',headers=h).json();assert {'stock','lots','boms','movements','production','telemetry'}<={d['id'] for d in c['datasets']}
    assert all(d['classification']=='internal' and d['owner'] and d['primary_key'] for d in c['datasets'])
    export=client.get('/api/integrations/export/stock',headers=h).json();assert export['manifest']['row_count']==len(export['rows'])
    one=client.get('/api/integrations/export/telemetry?limit=5',headers=h).json();two=client.get('/api/integrations/export/telemetry?limit=5&after_id='+str(one['manifest']['next_cursor']),headers=h).json()
    assert len(one['rows'])==5 and {e['id'] for e in one['rows']}.isdisjoint(e['id'] for e in two['rows'])
    assert client.get('/api/integrations/config',headers=h).status_code==403 and client.get('/api/integrations/events',headers=h).status_code==403

def test_outbox_atomicity_ack_failure_and_retry(client,auth,monkeypatch):
    h=auth();before=count();body={'event_id':'outbox-receipt','sku_id':'FLOUR','lot_code':'OUTBOX-TEST','quantity':'1','to_location':'RAW-01'}
    assert client.post('/api/supply/receipts',headers=h,json=body).status_code==200 and count()==before+1
    assert client.post('/api/supply/receipts',headers=h,json=body).json()['duplicate'] and count()==before+1
    assert client.post('/api/supply/receipts',headers=h,json={**body,'event_id':'bad-receipt','to_location':'FG-01'}).status_code==422 and count()==before+1
    assert client.post('/api/integrations/dispatch',headers=h,json={'limit':1}).status_code==409
    config=client.get('/api/integrations/config',headers=h).json()['config'];config['enabled']=True
    assert client.post('/api/integrations/config',headers=h,json={'expected_revision':1,'config':{**config,'password_env':'ADMIN_PASSWORD'}}).status_code==422
    assert client.post('/api/integrations/config',headers=h,json={'expected_revision':1,'config':config}).status_code==200
    calls=[]
    def no_ack(event,settings):calls.append(event);return {'acknowledged':False}
    monkeypatch.setitem(integrations.PUBLISHERS,'mqtt',no_ack);failed=client.post('/api/integrations/dispatch',headers=h,json={'limit':1}).json()['results'][0];assert failed['status']=='failed'
    def ack(event,settings):calls.append(event);return {'acknowledged':True,'protocol':'mqtt','message_id':4}
    monkeypatch.setitem(integrations.PUBLISHERS,'mqtt',ack);done=client.post('/api/integrations/dispatch',headers=h,json={'limit':1}).json()['results'][0]
    assert done['id']==failed['id'] and done['status']=='delivered' and calls[0]['id']==calls[1]['id']
    assert calls[0]['governance']['classification']=='internal' and calls[0]['dataschema'].endswith(':1')
    e=client.get('/api/integrations/events',headers=h).json()['events'][0];assert e['attempts']==2 and e['receipt']['acknowledged']

def test_new_telemetry_emits_outbox_once(client,auth):
    h=auth();before=count();body={'events':[{'event_id':'lake-event-1','source':'edge-real-input','asset_id':'NDL-MIX','temperature':45,'vibration':1,'good':2,'rejected':0}]}
    assert client.post('/api/telemetry/batch',headers=h,json=body).json()['accepted']==1 and count()==before+1
    assert client.post('/api/telemetry/batch',headers=h,json=body).json()['duplicates']==1 and count()==before+1
