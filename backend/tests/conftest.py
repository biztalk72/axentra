import os
import tempfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

_test_dir = tempfile.TemporaryDirectory(prefix='forge-test-')
os.environ['DATABASE_URL'] = os.getenv('TEST_DATABASE_URL', f'sqlite:///{Path(_test_dir.name) / "test.db"}')
os.environ['DEMO_MODE'] = 'true'
os.environ['DEMO_STREAM'] = 'false'
os.environ['ADMIN_EMAIL'] = 'admin@admin.com'
os.environ['ADMIN_PASSWORD'] = 'TestAdmin!2026'
os.environ['ALLOW_REGISTRATION'] = 'true'
from app.main import app
from app.db import Base, engine, SessionLocal, User
from app.security import hash_password

@pytest.fixture
def client():
    Base.metadata.drop_all(engine)
    with TestClient(app) as c:
        with SessionLocal() as db:
            for role in ('operator', 'viewer'):
                db.add(User(id=role, email=f'{role}@forge.local', name=role, role=role, password_hash=hash_password('TestAdmin!2026')))
            db.commit()
        yield c

@pytest.fixture
def auth(client):
    def headers(role='admin'):
        response=client.post('/api/auth/login',json={'email':'admin@admin.com' if role=='admin' else f'{role}@forge.local','password':'TestAdmin!2026'})
        assert response.status_code==200
        return {'Authorization':'Bearer '+response.json()['access_token']}
    return headers
