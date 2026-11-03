from alembic import context
from app.db import Base, engine
config=context.config
def run_migrations_online():
    with engine.connect() as connection:
        context.configure(connection=connection,target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
if context.is_offline_mode():
    context.configure(url=str(engine.url),target_metadata=Base.metadata,literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    run_migrations_online()
