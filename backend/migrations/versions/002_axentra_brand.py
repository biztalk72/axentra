"""Rename only unchanged default plant labels; preserve business records and audit history."""
from alembic import op
import sqlalchemy as sa

revision = '002_axentra_brand'
down_revision = '001_initial'
branch_labels = None
depends_on = None

def replace_defaults(names):
    connection = op.get_bind()
    resources = sa.table('resources', sa.column('id', sa.String), sa.column('data', sa.JSON))
    data = connection.execute(sa.select(resources.c.data).where(resources.c.id == 'INDUSTRY-PROFILE')).scalar_one_or_none()
    if data and data.get('config', {}).get('plant_name') in names:
        data['config']['plant_name'] = names[data['config']['plant_name']]
        data['revision'] = data.get('revision', 1) + 1
        connection.execute(resources.update().where(resources.c.id == 'INDUSTRY-PROFILE').values(data=data))

def upgrade():
    replace_defaults({'FORGE 라면 스마트팩토리': 'Axentra 라면 스마트팩토리', 'FORGE 제조 워크스페이스': 'Axentra 제조 워크스페이스'})

def downgrade():
    replace_defaults({'Axentra 라면 스마트팩토리': 'FORGE 라면 스마트팩토리', 'Axentra 제조 워크스페이스': 'FORGE 제조 워크스페이스'})
