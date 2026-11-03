import os
import math
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func, delete
from .db import Base, engine, SessionLocal, User, LoginSession, Asset, Resource, Telemetry, Audit
from .security import hash_password, verify_password
from .schemas import normalize_email, validate_password

DEMO_MODE = os.getenv('DEMO_MODE', 'true').lower() == 'true'

def initialize():
    # Local demo bootstrap only; production uses the checked-in Alembic migration.
    if DEMO_MODE:
        Base.metadata.create_all(engine)
    with SessionLocal() as db:
        email = normalize_email(os.getenv('ADMIN_EMAIL', 'admin@admin.com'))
        password = os.getenv('ADMIN_PASSWORD', '')
        admin = db.get(User, 'admin')
        configured = db.scalar(select(User).where(User.email == email))
        if configured and configured.id != 'admin':
            raise RuntimeError('ADMIN_EMAIL is already owned by a different account')
        if not admin and not password:
            raise RuntimeError('Set ADMIN_PASSWORD in .env before starting the API')
        if password:
            validate_password(password)
        changed = False
        if not admin:
            admin = User(id='admin', email=email, name='관리자', role='admin', password_hash=hash_password(password))
            db.add(admin)
            changed = True
        else:
            if admin.email != email:
                admin.email = email
                changed = True
            if password and not verify_password(password, admin.password_hash):
                admin.password_hash = hash_password(password)
                changed = True
        if changed:
            db.execute(delete(LoginSession).where(LoginSession.user_id == 'admin'))
            db.add(Audit(actor='system', action='auth.admin.configure', target=email, detail={'sessions_revoked': True}))
        # Reconfigure the administrator without deleting any existing factory or user data.
        db.flush()
        if not DEMO_MODE or db.scalar(select(func.count()).select_from(Asset)):
            db.commit()
            return
        names = [('CNC-001', 'CNC 가공기 01', 'CNC', 'A', 38), ('CNC-002', 'CNC 가공기 02', 'CNC', 'A', 42), ('CNC-003', 'CNC 가공기 03', 'CNC', 'A', 52), ('QC-001', '비전 검사기', 'QC', 'A', 28), ('ASM-001', '자동 조립기 01', 'Assembly', 'B', 36), ('ASM-002', '자동 조립기 02', 'Assembly', 'B', 40), ('PKG-001', '패키징 셀', 'Packaging', 'B', 30), ('WELD-001', '용접 로봇', 'Robot', 'B', 44)]
        stamp = datetime.now(timezone.utc)
        for i, (aid, name, kind, line, cycle) in enumerate(names):
            db.add(Asset(id=aid, name=name, kind=kind, line=line, cycle_time=cycle, status='warning' if aid=='CNC-003' else 'running', temperature=78.4 if aid=='CNC-003' else 42+i*2.3, vibration=3.8 if aid=='CNC-003' else 0.8+i*.12, produced=1450+i*83, rejected=12+i*2))
        db.flush()
        for i in range(96):
            for j, (aid, *_) in enumerate(names):
                db.add(Telemetry(event_id=f'seed-{i}-{j}', source='demo-seed', asset_id=aid, temperature=48+j+math.sin(i/8)*3, vibration=1+abs(math.sin(i/9+j))*.7, good=9, rejected=int(i%19==0), timestamp=(stamp-timedelta(minutes=(96-i)*5)).isoformat()))
        resources = [
          ('CON-001','connector','Edge Gateway 01','connected',{'protocol':'REST','endpoint':'/api/telemetry/batch','driver':'demo-rest','last_seen':stamp.isoformat()}),
          ('CON-002','connector','ERP · 생산계획','configured',{'protocol':'REST','endpoint':'ERP 어댑터 설정 대기','driver':'unconfigured'}),
          ('WO-2601','order','11월 모터 하우징 생산','running',{'product':'모터 하우징 M-240','line':'A','quantity':18000,'completed':12640}),
          ('WO-2602','order','배터리 모듈 브래킷','running',{'product':'브래킷 B-120','line':'B','quantity':12000,'completed':8540}),
          ('WO-2603','order','정밀 기어 샤프트','planned',{'product':'샤프트 S-080','line':'A','quantity':6000,'completed':0}),
          ('ROB-001','robot','AMR-001','idle',{'battery':86,'location':'자재 창고','jobs':24}),
          ('ROB-002','robot','AMR-002','idle',{'battery':72,'location':'출하 구역','jobs':18}),
          ('ALERT-SEED','alert','CNC-003 스핀들 온도 상승','open',{'asset_id':'CNC-003','severity':'warning','metric':'temperature','value':78.4,'threshold':75,'message':'스핀들 온도가 운영 임계값 75°C를 초과했습니다. 냉각 상태 점검을 권장합니다.'}),
          ('REC-SEED','recommendation','CNC-003 냉각 점검 작업 생성','pending',{'asset_id':'CNC-003','alert_id':'ALERT-SEED','reason':'온도 78.4°C, 임계값 75°C 초과. 냉각 상태 및 스핀들 점검이 필요합니다.','action':'maintenance','impact':'점검 작업 지시 생성 · 설비 자동 제어 없음','engine':'threshold-rule-v1'})]
        for rid, category, name, status, data in resources:
            db.add(Resource(id=rid, category=category, name=name, status=status, data=data))
        db.add(Audit(actor='system',action='demo.seed',target='부산 스마트팩토리',detail={'mode':'synthetic'}))
        db.commit()
