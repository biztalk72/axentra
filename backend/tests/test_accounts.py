import hashlib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
import pytest
from sqlalchemy import select, func
from app.db import User, Asset, LoginSession, SessionLocal, engine
from app.seed import initialize
from app.security import verify_password

TEST_PASSWORD='TrialUser!2026'
def registration(**changes):
    return {'name':'체험 사용자','email':'trial@example.com','password':TEST_PASSWORD,'password_confirm':TEST_PASSWORD,**changes}

def test_signup_auto_login_then_logout_and_relogin(client,auth):
    response=client.post('/api/auth/register',json=registration(name='  체험 사용자  ',email='  Trial@Example.COM  '))
    assert response.status_code==201
    result=response.json()
    assert result['user']=={'name':'체험 사용자','email':'trial@example.com','role':'operator'}
    h={'Authorization':'Bearer '+result['access_token']}
    assert client.get('/api/auth/me',headers=h).json()==result['user']
    assert client.get('/api/overview',headers=h).status_code==200
    assert client.post('/api/simulations',headers=h,json={}).status_code==201
    assert client.post('/api/models/train',headers=h,json={}).status_code==201
    assert client.post('/api/robot-jobs',headers=h,json={'robot_id':'AMR-001','destination':'제면 A라인'}).status_code==201
    assert client.get('/api/users',headers=h).status_code==403
    assert client.get('/api/audit',headers=h).status_code==403
    assert client.post('/api/recommendations/REC-SEED/decision',headers=h,json={'decision':'approve'}).status_code==403
    client.post('/api/auth/logout',headers=h)
    assert client.get('/api/auth/me',headers=h).status_code==401
    assert client.post('/api/auth/login',json={'email':'TRIAL@EXAMPLE.COM','password':TEST_PASSWORD}).status_code==200
    with SessionLocal() as db:
        user=db.scalar(select(User).where(User.email=='trial@example.com'))
        assert user.password_hash.startswith('pbkdf2_sha256$600000$')
        assert TEST_PASSWORD not in user.password_hash and verify_password(TEST_PASSWORD,user.password_hash)
    users=client.get('/api/users',headers=auth()).json()
    assert result['user'] in users
    assert all(set(u)=={'name','email','role'} for u in users)
    assert any(row['action']=='auth.register' and row['actor']=='trial@example.com' for row in client.get('/api/audit',headers=auth()).json())

def test_email_duplicates_and_reserved_addresses(client):
    assert client.post('/api/auth/register',json=registration()).status_code==201
    assert client.post('/api/auth/register',json=registration(email=' TRIAL@Example.Com ')).status_code==409
    for email in ['admin@admin.com','ADMIN@ADMIN.COM','admin@axentra.local','admin@forge.local']:
        assert client.post('/api/auth/register',json=registration(email=email)).status_code==409

def test_registration_validates_without_echoing_password(client):
    invalid=[{'password':'short','password_confirm':'short'}, {'password':'abcdefgh','password_confirm':'abcdefgh'}, {'password_confirm':'Mismatch1!'}, {'name':'  '}, {'email':'not-an-email'}, {'email':'.trial@example.com'}, {'role':'admin'}]
    for changes in invalid:
        body=registration(**changes)
        response=client.post('/api/auth/register',json=body)
        assert response.status_code==422
        assert TEST_PASSWORD not in response.text
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(User).where(User.email=='trial@example.com'))==0

def test_registration_can_be_disabled(client,monkeypatch):
    monkeypatch.setenv('ALLOW_REGISTRATION','false')
    assert client.get('/health').json()['registration_enabled'] is False
    assert client.post('/api/auth/register',json=registration()).status_code==403

def test_admin_reconfiguration_preserves_factory_and_revokes_old_sessions(client,auth):
    h=auth()
    with SessionLocal() as db:
        admin=db.get(User,'admin');admin.email='admin@axentra.local';admin.password_hash='invalid-old-hash'
        db.commit()
    initialize()
    assert client.get('/api/auth/me',headers=h).status_code==401
    fresh=auth()
    assert client.get('/api/auth/me',headers=fresh).json()['email']=='admin@admin.com'
    assert len(client.get('/api/assets',headers=fresh).json())==8
    assert any(u['email']=='operator@axentra.local' for u in client.get('/api/users',headers=fresh).json())
    initialize()
    assert client.get('/api/auth/me',headers=fresh).status_code==200

def test_legacy_password_hashes_remain_verifiable():
    salt='test-legacy-salt'
    value=hashlib.scrypt(TEST_PASSWORD.encode(),salt=salt.encode(),n=16384,r=8,p=1).hex()
    assert verify_password(TEST_PASSWORD,f'{salt}:{value}')
    assert not verify_password('incorrect',f'{salt}:{value}')

def test_concurrent_duplicate_signup_postgresql(client):
    if engine.dialect.name!='postgresql':
        pytest.skip('PostgreSQL unique constraint concurrency check')
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses=list(pool.map(lambda _:client.post('/api/auth/register',json=registration()).status_code,range(2)))
    assert sorted(responses)==[201,409]
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(User).where(User.email=='trial@example.com'))==1
