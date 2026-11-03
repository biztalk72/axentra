import os
import tempfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

_test_dir = tempfile.TemporaryDirectory(prefix='forge-test-')
os.environ['DATABASE_URL'] = os.getenv('TEST_DATABASE_URL', f'sqlite:///{Path(_test_dir.name) / "test.db"}')
os.environ['DEMO_MODE'] = 'true'
os.environ['DEMO_STREAM'] = 'false'
from app.main import app
from app.db import Base, engine

@pytest.fixture
def client():
    Base.metadata.drop_all(engine)
    with TestClient(app) as c:
        yield c

@pytest.fixture
def auth(client):
    def headers(role='admin'):
        response=client.post('/api/auth/login',json={'email':f'{role}@forge.local','password':'ForgeDemo!2026'})
        assert response.status_code==200
        return {'Authorization':'Bearer '+response.json()['access_token']}
    return headers
