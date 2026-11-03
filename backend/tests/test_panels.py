import copy
from sqlalchemy import select
from app.db import Resource,SessionLocal

def panel(client,h,pid='PANEL-A-TV'):
    return next(p for p in client.get('/api/panels',headers=h).json() if p['id']==pid)
def test_panel_seed_and_preview_are_independent_of_publication(client,auth):
    h=auth();rows=client.get('/api/panels',headers=h).json();assert len(rows)==4
    p=panel(client,h);draft=copy.deepcopy(p['draft']);draft['screens'][0]['title']='저장 전 미리보기'
    preview=client.post('/api/panels/preview',headers=h,json=draft)
    assert preview.status_code==200
    assert preview.json()['source']=='preview'
    assert all(a['line']=='A' for a in preview.json()['assets'])
    assert all(c['line']=='A' for c in preview.json()['cameras'])
    after=panel(client,h);assert after['published']['screens'][0]['title']!='저장 전 미리보기' and after['last_seen'] is None
    assert 'device_token_hash' not in str(rows)

def test_panel_draft_publish_and_optimistic_revision(client,auth):
    admin,operator=auth(),auth('operator');p=panel(client,admin);draft=copy.deepcopy(p['draft']);draft['name']='변경된 A라인 전광판'
    response=client.post('/api/panels/PANEL-A-TV/draft',headers=operator,json={'expected_revision':1,'config':draft})
    assert response.status_code==200 and response.json()['revision']==2
    live=client.get('/api/panels/PANEL-A-TV/display',headers=operator).json();assert live['config']['name']!=draft['name']
    assert client.post('/api/panels/PANEL-A-TV/draft',headers=admin,json={'expected_revision':1,'config':draft}).status_code==409
    assert client.post('/api/panels/PANEL-A-TV/publish',headers=operator,json={'expected_revision':2}).status_code==403
    assert client.post('/api/panels/PANEL-A-TV/publish',headers=admin,json={'expected_revision':2}).json()['published_revision']==2
    assert client.get('/api/panels/PANEL-A-TV/display',headers=admin).json()['config']['name']==draft['name']

def test_invalid_config_cross_line_cameras_and_viewer_writes(client,auth):
    h=auth();p=panel(client,h)
    for modify in [lambda c:c.update(screens=[]),lambda c:c.update(refresh_interval=1),lambda c:c['screens'].append(copy.deepcopy(c['screens'][0])),lambda c:c['camera_widget'].update(camera_ids=['CAM-B-01'])]:
        cfg=copy.deepcopy(p['draft']);modify(cfg)
        assert client.post('/api/panels',headers=h,json=cfg).status_code==422
    assert client.post('/api/panels',headers=auth('viewer'),json=p['draft']).status_code==403
    new=client.post('/api/panels',headers=h,json=p['draft']).json()
    assert new['published'] is None
    assert client.get(f'/api/panels/{new["id"]}/display',headers=h).status_code==409

def test_bulk_layout_and_publish_are_atomic(client,auth):
    h=auth();a,b=panel(client,h),panel(client,h,'PANEL-B-TV');screens=copy.deepcopy(a['draft']['screens'][:1]);screens[0]['title']='공통 화면'
    body={'targets':[{'id':a['id'],'expected_revision':1},{'id':b['id'],'expected_revision':99}],'screens':screens,'theme':'light','refresh_interval':10,'rotation_enabled':False}
    assert client.post('/api/panels/bulk-layout',headers=h,json=body).status_code==409
    assert panel(client,h)['revision']==1
    body['targets'][1]['expected_revision']=1
    result=client.post('/api/panels/bulk-layout',headers=h,json=body);assert result.status_code==200
    current=panel(client,h,'PANEL-B-TV');assert current['draft']['line']=='B' and current['draft']['camera_widget']['camera_ids']==b['draft']['camera_widget']['camera_ids']
    targets=[{'id':a['id'],'expected_revision':2},{'id':b['id'],'expected_revision':99}]
    assert client.post('/api/panels/bulk-publish',headers=h,json={'targets':targets}).status_code==409
    assert panel(client,h)['published_revision']==1
    targets[1]['expected_revision']=2
    assert client.post('/api/panels/bulk-publish',headers=h,json={'targets':targets}).status_code==200
    assert panel(client,h,'PANEL-B-TV')['published_revision']==2

def test_device_key_is_scoped_revocable_and_heartbeat_is_explicit(client,auth):
    h=auth();access=client.post('/api/panels/PANEL-A-TV/access',headers=h).json();device={'Authorization':'Bearer '+access['access_token']}
    assert client.get('/api/panels/PANEL-A-TV/display',headers=device).status_code==200
    assert panel(client,h)['last_seen'] is None
    assert client.get('/api/panels/PANEL-B-TV/display',headers=device).status_code==401
    assert client.get('/api/overview',headers=device).status_code==401
    assert client.post('/api/panels/PANEL-A-TV/draft',headers=device,json={'expected_revision':1,'config':panel(client,h)['draft']}).status_code==401
    assert client.post('/api/panels/PANEL-A-TV/heartbeat',headers=device,json={'screen_id':'screen-production','revision':1}).status_code==200
    assert panel(client,h)['connection']=='online'
    client.post('/api/panels/PANEL-A-TV/access',headers=h)
    assert client.get('/api/panels/PANEL-A-TV/display',headers=device).status_code==401

def test_touch_requests_idempotent_line_scoped_and_permission_checked(client,auth):
    h=auth();device={'Authorization':'Bearer '+client.post('/api/panels/PANEL-A-TOUCH/access',headers=h).json()['access_token']}
    body={'event_id':'same-request','action':'support.request','reason':'equipment'}
    first=client.post('/api/panels/PANEL-A-TOUCH/events',headers=device,json=body)
    assert first.status_code==201 and first.json()['duplicate'] is False
    assert client.post('/api/panels/PANEL-A-TOUCH/events',headers=device,json=body).json()['duplicate'] is True
    assert client.post('/api/panels/PANEL-A-TOUCH/events',headers=auth('viewer'),json=body).status_code==403
    invalid={'event_id':'wrong-line','action':'work.acknowledge','order_id':'WO-2602'}
    assert client.post('/api/panels/PANEL-A-TOUCH/events',headers=device,json=invalid).status_code==422
    valid={**invalid,'event_id':'correct-line','order_id':'WO-2601'}
    assert client.post('/api/panels/PANEL-A-TOUCH/events',headers=device,json=valid).status_code==201
    view=client.get('/api/panels/PANEL-A-TOUCH/display',headers=device).json()
    assert len(view['events'])==2
    tv=client.post('/api/panels/PANEL-A-TV/events',headers=h,json=body)
    assert tv.status_code==403

def test_cameras_and_personal_dashboard_widget_settings(client,auth):
    h=auth();assert len(client.get('/api/cameras',headers=h).json())==4
    body={'name':'실제 카메라 설정','line':'A','location':'입구','source_type':'hls','url':'https://stream.example.com/line-a.m3u8','enabled':True,'fit':'contain'}
    camera=client.post('/api/cameras',headers=auth('operator'),json=body)
    assert camera.status_code==201 and camera.json()['revision']==1
    for url in ['rtsp://camera.local/live','https://user:password@camera.local/live','javascript:alert(1)']:
        assert client.post('/api/cameras',headers=h,json={**body,'url':url}).status_code==422
    saved=camera.json();assert client.post('/api/cameras/'+saved['id'],headers=h,json={'expected_revision':99,'config':body}).status_code==409
    assert client.post('/api/cctv/layout',headers=h,json={'enabled':True,'minimized':True,'camera_ids':['CAM-A-01'],'layout':'single'}).status_code==200
    assert client.get('/api/cctv/layout',headers=h).json()['minimized'] is True
    assert client.get('/api/cctv/layout',headers=auth('operator')).json()['minimized'] is False
    assert client.post('/api/cctv/layout',headers=h,json={'camera_ids':['unknown']}).status_code==422
