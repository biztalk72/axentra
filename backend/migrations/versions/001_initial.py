"""Initial manufacturing schema (explicit and reproducible)."""
from alembic import op
import sqlalchemy as sa
revision='001_initial'
down_revision=None
branch_labels=None
depends_on=None

def upgrade():
    op.create_table('users',sa.Column('id',sa.String(50),primary_key=True),sa.Column('email',sa.String(200),nullable=False,unique=True),sa.Column('name',sa.String(100),nullable=False),sa.Column('role',sa.String(20),nullable=False),sa.Column('password_hash',sa.String(500),nullable=False))
    op.create_table('login_sessions',sa.Column('token_hash',sa.String(64),primary_key=True),sa.Column('user_id',sa.String(50),sa.ForeignKey('users.id'),nullable=False),sa.Column('expires_at',sa.String(50),nullable=False))
    op.create_table('assets',sa.Column('id',sa.String(50),primary_key=True),sa.Column('name',sa.String(100),nullable=False),sa.Column('kind',sa.String(50),nullable=False),sa.Column('line',sa.String(50),nullable=False),sa.Column('status',sa.String(30),nullable=False),sa.Column('cycle_time',sa.Float,nullable=False),sa.Column('temperature',sa.Float,nullable=False),sa.Column('vibration',sa.Float,nullable=False),sa.Column('produced',sa.Integer,nullable=False),sa.Column('rejected',sa.Integer,nullable=False),sa.Column('updated_at',sa.String(50),nullable=False))
    op.create_table('telemetry',sa.Column('id',sa.Integer,primary_key=True),sa.Column('event_id',sa.String(100),nullable=False),sa.Column('source',sa.String(50),nullable=False),sa.Column('asset_id',sa.String(50),sa.ForeignKey('assets.id'),nullable=False),sa.Column('temperature',sa.Float,nullable=False),sa.Column('vibration',sa.Float,nullable=False),sa.Column('good',sa.Integer,nullable=False),sa.Column('rejected',sa.Integer,nullable=False),sa.Column('timestamp',sa.String(50),nullable=False),sa.UniqueConstraint('source','event_id'))
    op.create_index('ix_telemetry_asset_id','telemetry',['asset_id'])
    op.create_index('ix_telemetry_timestamp','telemetry',['timestamp'])
    op.create_table('resources',sa.Column('id',sa.String(60),primary_key=True),sa.Column('category',sa.String(30),nullable=False),sa.Column('name',sa.String(200),nullable=False),sa.Column('status',sa.String(40),nullable=False),sa.Column('data',sa.JSON,nullable=False),sa.Column('created_at',sa.String(50),nullable=False))
    op.create_index('ix_resources_category','resources',['category'])
    op.create_table('audit_logs',sa.Column('id',sa.Integer,primary_key=True),sa.Column('actor',sa.String(200),nullable=False),sa.Column('action',sa.String(100),nullable=False),sa.Column('target',sa.String(100),nullable=False),sa.Column('detail',sa.JSON,nullable=False),sa.Column('created_at',sa.String(50),nullable=False))

def downgrade():
    for name in ['audit_logs','resources','telemetry','assets','login_sessions','users']:
        op.drop_table(name)
