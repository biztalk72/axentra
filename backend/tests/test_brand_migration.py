import importlib.util
from pathlib import Path
from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.db import Resource, SessionLocal, engine

def test_brand_migration_changes_only_default_plant_labels(client):
    spec = importlib.util.spec_from_file_location('brand_migration', Path(__file__).parents[1] / 'migrations/versions/002_axentra_brand.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with SessionLocal() as db:
        profile = db.get(Resource, 'INDUSTRY-PROFILE')
        config = {**profile.data['config'], 'plant_name': 'FORGE 라면 스마트팩토리'}
        profile.data = {'revision': 7, 'config': config}
        db.commit()
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()
    with SessionLocal() as db:
        profile = db.get(Resource, 'INDUSTRY-PROFILE')
        assert profile.data == {'revision': 8, 'config': {**config, 'plant_name': 'Axentra 라면 스마트팩토리'}}
        profile.data = {'revision': 9, 'config': {**config, 'plant_name': 'Customer Custom Factory'}}
        db.commit()
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()
    with SessionLocal() as db:
        profile = db.get(Resource, 'INDUSTRY-PROFILE')
        assert profile.data['config']['plant_name'] == 'Customer Custom Factory'
        assert profile.data['revision'] == 9
