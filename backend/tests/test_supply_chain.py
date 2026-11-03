import copy
from datetime import datetime,timedelta,timezone
from concurrent.futures import ThreadPoolExecutor
import pytest
from sqlalchemy import select,update,delete,func
from app.db import SessionLocal,Resource,Asset,Telemetry,User,engine
from app.industry_migration import migrate_ramen_demo

def state(c,h):return c.get('/api/supply',headers=h).json()
def recipe(s,sku):return next(b for b in s['boms'] if b['product_sku_id']==sku)
def receipt(event='receipt-test',**patch):
    today=datetime.now(timezone.utc).date()
    return {'event_id':event,'sku_id':'FLOUR','lot_code':'TEST-RAW-01','quantity':'2.500','to_location':'RAW-01','manufactured_on':today.isoformat(),'expires_on':(today+timedelta(days=20)).isoformat(),'supplier':'테스트 공급처','reference':'입고 검증',**patch}

def test_ramen_domain_and_inventory_transaction_guards(client,auth):
    h=auth();op=auth('operator');assets=client.get('/api/assets',headers=h).json()
    assert {a['id'] for a in assets}=={'NDL-MIX','NDL-SHEET','NDL-STEAM','NDL-PACK','SUP-BLEND','SUP-SIEVE','SUP-FILL','SUP-PACK'}
    s=state(client,h);assert len(s['skus'])==14 and len(s['locations'])==6 and len(s['boms'])==5 and len(s['batches'])==5 and 'events' not in s
    assert client.post('/api/supply/receipts',headers=auth('viewer'),json=receipt()).status_code==403
    body=receipt();response=client.post('/api/supply/receipts',headers=op,json=body);assert response.status_code==200,response.text
    lid=response.json()['lot_id'];before=state(client,h)
    assert client.post('/api/supply/receipts',headers=op,json=body).json()['duplicate'] and state(client,h)==before
    assert client.post('/api/supply/receipts',headers=op,json={**body,'quantity':'3'}).status_code==409
    issue={'event_id':'issue-test','lot_id':lid,'from_location':'RAW-01','quantity':'.125'}
    assert client.post('/api/supply/issues',headers=op,json=issue).status_code==409
    assert client.post('/api/supply/lot-status',headers=op,json={'lot_id':lid,'expected_revision':1,'status':'released'}).status_code==403
    assert client.post('/api/supply/lot-status',headers=h,json={'lot_id':lid,'expected_revision':1,'status':'released'}).status_code==200
    assert client.post('/api/supply/issues',headers=op,json=issue).status_code==200
    move={'event_id':'move-test','lot_id':lid,'from_location':'RAW-01','to_location':'RAW-02','quantity':'.375'}
    assert client.post('/api/supply/transfers',headers=op,json=move).status_code==200
    after=state(client,h);assert {b['location_id']:b['quantity'] for b in after['balances'] if b['lot_id']==lid}=={'RAW-01':'2.000','RAW-02':'0.375'}
    assert client.post('/api/supply/transfers',headers=op,json={**move,'event_id':'bad-location','to_location':'FG-01'}).status_code==422
    assert client.post('/api/supply/issues',headers=op,json={**issue,'event_id':'overdraw','quantity':'5'}).status_code==409
    assert state(client,h)==after

def test_bom_production_atomicity_versions_and_genealogy(client,auth):
    h=auth();initial=state(client,h);bom=recipe(initial,'RAMEN');request={'bom_id':bom['id'],'bom_revision':1,'quantity':'1000'}
    plan=client.post('/api/supply/production-preview',headers=h,json=request).json();assert plan['ready'] and state(client,h)==initial
    body={**request,'event_id':'make-ramen','lot_code':'RAMEN-TEST-01','to_location':'FG-01','expires_on':receipt()['expires_on'],'allocations':plan['allocations']}
    bad=copy.deepcopy(body);bad['allocations'][0]['quantity']='1'
    assert client.post('/api/supply/production',headers=h,json=bad).status_code==422 and state(client,h)==initial
    response=client.post('/api/supply/production',headers=h,json=body);assert response.status_code==200,response.text
    result=response.json();after=state(client,h)
    assert next(l for l in after['lots'] if l['id']==result['lot_id'])['status']=='quarantine'
    assert next(b for b in after['balances'] if b['lot_id']==result['lot_id'])['quantity']=='1000.000'
    assert client.post('/api/supply/production',headers=h,json=body).json()['duplicate'] and state(client,h)==after
    change={k:copy.deepcopy(bom[k]) for k in ('product_sku_id','name','output_quantity','components')};change.update(name='개정 라면 BOM',expected_revision=1)
    assert client.post('/api/supply/boms',headers=h,json=change).json()['revision']==2
    assert client.post('/api/supply/production-preview',headers=h,json=request).status_code==409
    assert next(b for b in state(client,h)['batches'] if b['batch_id']==result['batch_id'])['bom_snapshot']['revision']==1
    graph=client.get('/api/supply/lots/'+result['lot_id']+'/trace',headers=h).json()
    assert {'FLOUR','SPICE','NOODLE','SOUP','SOUP-PACK','RAMEN'}<={l['sku_id'] for l in graph['nodes']} and graph['edges']

def test_bom_cycle_units_and_location_edit_validation(client,auth):
    h=auth();s=state(client,h)
    assert client.post('/api/supply/boms',headers=h,json={'product_sku_id':'FLOUR','name':'순환 거부','output_quantity':'100','components':[{'sku_id':'NOODLE','quantity':'1'}]}).status_code==422
    sku=next(x for x in s['skus'] if x['id']=='FLOUR');body={k:sku[k] for k in ('id','name','category','unit','min_stock')}
    assert client.post('/api/supply/skus',headers=h,json={**body,'unit':'ea','expected_revision':1}).status_code==409
    loc=next(l for l in s['locations'] if l['id']=='RAW-01');body={k:loc[k] for k in ('id','name','warehouse','zone','allowed_categories')}
    assert client.post('/api/supply/locations',headers=h,json={**body,'allowed_categories':['finished'],'expected_revision':1}).status_code==409
    assert client.post('/api/supply/receipts',headers=h,json=receipt('fraction-ea',sku_id='FILM',to_location='PKG-01',quantity='.5')).status_code==422
    assert state(client,h)==s

def test_expired_and_quarantined_lots_excluded_from_fefo(client,auth):
    h=auth();today=datetime.now(timezone.utc).date();body=receipt('expired',lot_code='EXPIRED-TEST',manufactured_on=(today-timedelta(days=3)).isoformat(),expires_on=(today-timedelta(days=1)).isoformat())
    lid=client.post('/api/supply/receipts',headers=h,json=body).json()['lot_id'];client.post('/api/supply/lot-status',headers=h,json={'lot_id':lid,'expected_revision':1,'status':'released'})
    assert client.post('/api/supply/issues',headers=h,json={'event_id':'expire-issue','lot_id':lid,'from_location':'RAW-01','quantity':'1'}).status_code==409
    s=state(client,h);bom=recipe(s,'NOODLE');plan=client.post('/api/supply/production-preview',headers=h,json={'bom_id':bom['id'],'bom_revision':1,'quantity':'100'}).json()
    held={l['id'] for l in s['lots'] if l['status']!='released'}|{lid};assert not held&{a['lot_id'] for a in plan['allocations']}

def test_industry_change_and_common_agent_widget_compatibility(client,auth):
    h=auth();before=state(client,h);profile=client.get('/api/industry',headers=h).json();general=next(p for p in profile['templates'] if p['id']=='general')
    assert client.post('/api/industry',headers=auth('operator'),json={'expected_revision':1,'config':general}).status_code==403
    assert client.post('/api/industry',headers=h,json={'expected_revision':1,'config':general}).status_code==200 and state(client,h)==before
    modules=client.get('/api/agents/modules',headers=h).json();assert all(m['compatible'] for m in modules if m['id'] in ['logistics','inventory','classification','warehouse','lot','bom'])
    assert not next(m for m in modules if m['id']=='noodles')['compatible']
    assert client.post('/api/agents/runs',headers=h,json={'goal':'업종 호환성 검증 실행','line':'A','agent_ids':['noodles']}).status_code==422
    run=client.post('/api/agents/runs',headers=h,json={'goal':'공통 공급망 에이전트 실행','line':'A','agent_ids':['lot','bom']}).json();result=client.get('/api/agents/runs/'+run['id'],headers=h).json()
    assert result['status']=='completed' and {'data','inventory','lot','bom'}<={t['id'] for t in result['tasks']}
    widgets=client.get('/api/agent-widgets/results',headers=h).json();assert len(widgets)==4 and all(w['status']=='ready' for w in widgets)
    assert next(w for w in widgets if w['id']=='lot')['fact']['metrics']['held_lots']==1
    assert state(client,h)==before

def test_widgets_install_on_dashboard_and_scoped_panel(client,auth):
    h=auth();op=auth('operator');client.post('/api/agent-widgets/layout',headers=op,json={'enabled':True,'line':'B','module_ids':['inventory','classification']})
    assert client.get('/api/agent-widgets/layout',headers=op).json()['line']=='B'
    panel=next(p for p in client.get('/api/panels',headers=h).json() if p['id']=='PANEL-A-TV');assert any(s['template']=='agents' for s in panel['published']['screens'])
    token=client.post('/api/panels/PANEL-A-TV/access',headers=h).json()['access_token'];headers={'Authorization':'Bearer '+token}
    display=client.get('/api/panels/PANEL-A-TV/display',headers=headers).json();assert len(display['agent_widgets'])==4 and all(w['status']=='ready' for w in display['agent_widgets'])
    assert client.get('/api/supply',headers=headers).status_code==401

def test_concurrent_stock_issues_cannot_overdraw(client,auth):
    if engine.dialect.name!='postgresql':pytest.skip('PostgreSQL row lock check')
    h=auth();s=state(client,h);lid=next(l['id'] for l in s['lots'] if l['code']=='FLOUR-DEMO-01')
    def issue(n):return client.post('/api/supply/issues',headers=h,json={'event_id':'parallel-'+str(n),'lot_id':lid,'from_location':'RAW-01','quantity':'700'}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(issue,[1,2]))
    assert sorted(results)==[200,409]
    assert next(b for b in state(client,h)['balances'] if b['lot_id']==lid and b['location_id']=='RAW-01')['quantity']=='400.000'

def test_known_demo_migration_keeps_accounts_and_report_snapshots(client,auth):
    import json
    from pathlib import Path
    catalog=json.loads((Path(__file__).parents[1]/'app/supply/assets.json').read_text());auth()
    with SessionLocal() as db:
        users=set(db.scalars(select(User.id)).all());count=db.scalar(select(func.count()).select_from(Telemetry))
        for entry in catalog:
            a=db.get(Asset,entry['id']);attrs={c.name:getattr(a,c.name) for c in Asset.__table__.columns};attrs.update(id=entry['legacy_id'],name=entry['legacy_name']);db.add(Asset(**attrs))
        db.flush()
        for entry in catalog:db.execute(update(Telemetry).where(Telemetry.asset_id==entry['id']).values(asset_id=entry['legacy_id']))
        db.execute(delete(Asset).where(Asset.id.in_([e['id'] for e in catalog])));db.add(Resource(id='HISTORY-LEGACY',category='agent_run',name='이전 업종 이력',status='completed',data={'context':{'assets':[{'id':'CNC-001'}]}}));db.commit()
        migrate_ramen_demo(db);db.commit()
        assert set(db.scalars(select(User.id)).all())==users and db.scalar(select(func.count()).select_from(Telemetry))==count
        assert db.get(Resource,'HISTORY-LEGACY').data['context']['assets'][0]['id']=='CNC-001'
        assert db.get(Asset,'NDL-MIX') and not db.get(Asset,'CNC-001') and db.get(Resource,'RAMEN-DEMO-V1').data['history_preserved']
