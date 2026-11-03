import asyncio
import contextlib
import hashlib
import json
import logging
import math
import os
import secrets
import statistics
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Literal
from fastapi import FastAPI, Depends, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy import select, func, update, delete, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from .db import SessionLocal, User, LoginSession, Asset, Telemetry, Resource, Audit, get_db, now
from .security import current_user, roles, verify_password, hash_password
from .schemas import RegisterInput, LoginInput, BatchInput, EventInput, ConnectorInput, SimulationInput, TrainInput, OrderInput, DecisionInput, RobotInput, DatasetInput
from .seed import initialize, DEMO_MODE
from .panels import router as field_router, initialize_field_devices
from .agents import router as agent_router, recover_agent_runs
from .services import resource_dict, asset_dict, add_resource, get_resource, identifier, audit, ingest, calculate_simulation

logger=logging.getLogger('forge')
requests_total=Counter('forge_http_requests_total','HTTP requests',['method','status'])
latency=Histogram('forge_http_request_seconds','HTTP request latency')

async def demo_stream():
    while True:
        await asyncio.sleep(8)
        try:
            with SessionLocal() as db:
                demo_tick(db)
                db.commit()
        except Exception:
            logger.exception('Demo collection failed')

def demo_tick(db):
    tick=time.time()
    events=[]
    for i, a in enumerate(db.scalars(select(Asset).order_by(Asset.id)).all()):
        events.append(EventInput(event_id=identifier('DEMO'),asset_id=a.id,source='demo-gateway',temperature=round(78+math.sin(tick/30)*2 if a.id=='CNC-003' else 45+i+math.sin(tick/45)*3,2),vibration=round(3.8 if a.id=='CNC-003' else 1+abs(math.sin(tick/25+i))*.6,2),good=4+i%3,rejected=int(a.id=='CNC-003')))
    return ingest(db,events)

@asynccontextmanager
async def lifespan(app):
    initialize()
    initialize_field_devices()
    recover_agent_runs()
    task=asyncio.create_task(demo_stream()) if DEMO_MODE and os.getenv('DEMO_STREAM','true').lower()=='true' else None
    yield
    if task:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

app=FastAPI(title='FORGE AX API',description='전주기 제조 AX 플랫폼 · MVP',version='0.1.0',lifespan=lifespan)
app.include_router(field_router)
app.include_router(agent_router)
app.add_middleware(CORSMiddleware,allow_origins=os.getenv('CORS_ORIGINS','http://127.0.0.1:5173,http://localhost:5173').split(','),allow_credentials=False,allow_methods=['GET','POST'],allow_headers=['Authorization','Content-Type'])

@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Never echo submitted passwords or whole registration payloads in errors.
    return JSONResponse(status_code=422, content={'detail':[{'loc':e['loc'], 'msg':e['msg'], 'type':e['type']} for e in exc.errors()]})

@app.middleware('http')
async def observe(request: Request, call_next):
    started=time.perf_counter()
    response=await call_next(request)
    requests_total.labels(request.method,str(response.status_code)).inc()
    latency.observe(time.perf_counter()-started)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['X-Request-ID']=secrets.token_hex(8)
    return response

@app.get('/health')
def health(db: Session=Depends(get_db)):
    db.execute(text('SELECT 1'))
    return {'status':'ok','version':'0.1.0','demo':DEMO_MODE,'registration_enabled':registration_enabled(),'stream':DEMO_MODE and os.getenv('DEMO_STREAM','true').lower()=='true'}

@app.get('/metrics', include_in_schema=False)
def metrics(user: User=Depends(roles('admin'))):
    return Response(generate_latest(),media_type=CONTENT_TYPE_LATEST)

def registration_enabled():
    return os.getenv('ALLOW_REGISTRATION', 'true' if DEMO_MODE else 'false').lower() == 'true'

def user_dict(user):
    return {'name':user.name, 'email':user.email, 'role':user.role}

def issue_session(db, user):
    token = secrets.token_urlsafe(40)
    db.execute(delete(LoginSession).where(LoginSession.expires_at < now()))
    db.add(LoginSession(token_hash=hashlib.sha256(token.encode()).hexdigest(), user_id=user.id, expires_at=(datetime.now(timezone.utc)+timedelta(hours=8)).isoformat()))
    audit(db, user.email, 'auth.login', user.id)
    return {'access_token':token, 'token_type':'bearer', 'user':user_dict(user)}

@app.post('/api/auth/register', status_code=201)
def register(body: RegisterInput, db: Session=Depends(get_db)):
    if not registration_enabled():
        raise HTTPException(403, '이 워크스페이스는 직접 가입을 허용하지 않습니다.')
    if body.email in {os.getenv('ADMIN_EMAIL', 'admin@admin.com').strip().lower(), 'admin@admin.com', 'admin@forge.local'}:
        raise HTTPException(409, '관리자 전용 이메일입니다. 다른 이메일을 사용하세요.')
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(409, '이미 가입된 이메일입니다. 로그인해 주세요.')
    user = User(id=identifier('USR'), name=body.name, email=body.email, role='operator', password_hash=hash_password(body.password))
    try:
        db.add(user)
        db.flush()
        audit(db, user.email, 'auth.register', user.id, {'role':'operator'})
        result = issue_session(db, user)
        db.commit()
        return result
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, '이미 가입된 이메일입니다. 로그인해 주세요.')

@app.post('/api/auth/login')
def login(body: LoginInput, db: Session=Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, '이메일 또는 비밀번호를 확인하세요.')
    result = issue_session(db, user)
    db.commit()
    return result

@app.get('/api/users')
def list_users(user: User=Depends(roles('admin')), db: Session=Depends(get_db)):
    return [user_dict(row) for row in db.scalars(select(User).order_by(User.email)).all()]

@app.get('/api/auth/me')
def me(user: User=Depends(current_user)):
    return {'name':user.name,'email':user.email,'role':user.role}

@app.post('/api/auth/logout')
def logout(request: Request, user: User=Depends(current_user), db: Session=Depends(get_db)):
    token=request.headers['authorization'].split(' ',1)[1]
    db.execute(delete(LoginSession).where(LoginSession.token_hash==hashlib.sha256(token.encode()).hexdigest()))
    audit(db,user.email,'auth.logout',user.id)
    db.commit()
    return {'ok':True}

@app.get('/api/overview')
def overview(user: User=Depends(current_user),db: Session=Depends(get_db)):
    assets=db.scalars(select(Asset).order_by(Asset.id)).all()
    good=sum(a.produced for a in assets)
    rejected=sum(a.rejected for a in assets)
    running=sum(a.status in ('running','warning') for a in assets)
    quality=good/max(good+rejected,1)
    # Snapshot index; true OEE needs planned/actual runtime and ideal-cycle counters.
    availability=running/max(len(assets),1)
    total=db.scalar(select(func.count()).select_from(Telemetry))
    recent=db.scalars(select(Telemetry).order_by(Telemetry.id.desc()).limit(768)).all()
    buckets={}
    for e in reversed(recent):
        key=e.timestamp[:16]
        b=buckets.setdefault(key,{'time':e.timestamp,'good':0,'rejected':0,'temperature':0,'count':0})
        b['good']+=e.good
        b['rejected']+=e.rejected
        b['temperature']+=e.temperature
        b['count']+=1
    series=[{**b,'temperature':round(b['temperature']/b['count'],1)} for b in buckets.values()][-24:]
    alerts=db.scalars(select(Resource).where(Resource.category=='alert',Resource.status=='open').order_by(Resource.created_at.desc())).all()
    pending=db.scalar(select(func.count()).select_from(Resource).where(Resource.category=='recommendation',Resource.status=='pending'))
    return {'assets':[asset_dict(a) for a in assets], 'kpis':{'equipment_health':round(availability*quality*100,1),'quality':round(quality*100,1),'produced':good,'rejected':rejected,'running':running,'total_assets':len(assets),'events':total,'pending':pending},'series':series,'alerts':[resource_dict(r) for r in alerts],'server_time':now(),'demo':DEMO_MODE}

@app.get('/api/assets')
def assets(user: User=Depends(current_user),db: Session=Depends(get_db)):
    return [asset_dict(a) for a in db.scalars(select(Asset).order_by(Asset.id)).all()]

@app.get('/api/resources/{category}')
def resources(category: Literal['connector','order','robot','alert','recommendation','simulation','model','job','dataset','maintenance'],user: User=Depends(current_user),db: Session=Depends(get_db)):
    rows=db.scalars(select(Resource).where(Resource.category==category).order_by(Resource.created_at.desc()).limit(200)).all()
    return [resource_dict(r) for r in rows]

@app.post('/api/telemetry/batch')
def telemetry(body: BatchInput,user: User=Depends(roles('operator','admin')),db: Session=Depends(get_db)):
    try:
        result=ingest(db,body.events)
        audit(db,user.email,'telemetry.ingest','batch',result)
        db.commit()
        return result
    except IntegrityError:
        db.rollback()
        raise HTTPException(409,'동시 수집 충돌입니다. 동일 event_id로 재시도하세요.')

@app.get('/api/telemetry')
def telemetry_list(asset_id: str|None=None,limit: int=Query(100,ge=1,le=1000),user: User=Depends(current_user),db: Session=Depends(get_db)):
    query=select(Telemetry)
    if asset_id:
        query=query.where(Telemetry.asset_id==asset_id)
    return [{c.name:getattr(e,c.name) for c in Telemetry.__table__.columns} for e in db.scalars(query.order_by(Telemetry.id.desc()).limit(limit)).all()]

@app.get('/api/telemetry/export')
def telemetry_export(user: User=Depends(current_user), db: Session=Depends(get_db)):
    rows=db.scalars(select(Telemetry).order_by(Telemetry.id.desc()).limit(10000)).all()
    body='id,asset_id,temperature,vibration,good,rejected,timestamp\n'+'\n'.join(f'{r.id},{r.asset_id},{r.temperature},{r.vibration},{r.good},{r.rejected},{r.timestamp}' for r in rows)
    return Response(body,media_type='text/csv',headers={'Content-Disposition':'attachment; filename="forge-telemetry.csv"'})

@app.post('/api/demo/tick')
def tick(user: User=Depends(roles('operator','admin')),db: Session=Depends(get_db)):
    if not DEMO_MODE:
        raise HTTPException(404,'데모 기능이 비활성화되어 있습니다.')
    result=demo_tick(db)
    audit(db,user.email,'demo.collect','all-assets',result)
    db.commit()
    return result

@app.post('/api/connectors',status_code=201)
def create_connector(body: ConnectorInput,user: User=Depends(roles('admin')),db: Session=Depends(get_db)):
    row=add_resource(db,'connector',body.name,'configured',{'protocol':body.protocol,'endpoint':body.endpoint,'driver':'unconfigured','note':'설정만 저장됩니다. 실제 프로토콜 어댑터는 별도 구축이 필요합니다.'})
    audit(db,user.email,'connector.create',row.id)
    db.commit()
    return resource_dict(row)

@app.post('/api/simulations',status_code=201)
def simulate(body: SimulationInput,user: User=Depends(roles('operator','admin')),db: Session=Depends(get_db)):
    result=calculate_simulation(db,body)
    row=add_resource(db,'simulation',body.name,'completed',{**body.model_dump(),**result})
    audit(db,user.email,'simulation.run',row.id,body.model_dump())
    db.commit()
    return resource_dict(row)

@app.post('/api/models/train',status_code=201)
def train(body: TrainInput,user: User=Depends(roles('operator','admin')),db: Session=Depends(get_db)):
    if not db.get(Asset,body.asset_id):
        raise HTTPException(404,'등록되지 않은 설비입니다.')
    rows=db.scalars(select(Telemetry).where(Telemetry.asset_id==body.asset_id).order_by(Telemetry.id.desc()).limit(500)).all()
    if len(rows)<20:
        raise HTTPException(422,'최소 20개 학습 이벤트가 필요합니다.')
    # Chronological split: held-out deviation is descriptive, not labeled accuracy.
    values=[getattr(r,body.metric) for r in reversed(rows)]
    split=int(len(values)*.8)
    train_values=values[:split]
    mean=statistics.mean(train_values)
    std=max(statistics.pstdev(train_values),.1)
    holdout=values[split:]
    row=add_resource(db,'model',body.name,'trained',{'asset_id':body.asset_id,'metric':body.metric,'algorithm':'Gaussian z-score','mean':round(mean,5),'std':round(std,5),'threshold':3,'samples':len(values),'train_samples':split,'holdout_samples':len(holdout),'holdout_anomaly_rate':round(sum(abs(v-mean)/std>3 for v in holdout)/len(holdout)*100,1),'version':identifier('v'),'data_source':'synthetic' if DEMO_MODE else 'telemetry'})
    audit(db,user.email,'model.train',row.id,{'samples':len(values)})
    db.commit()
    return resource_dict(row)

@app.post('/api/models/{model_id}/deploy')
def deploy_model(model_id:str,user: User=Depends(roles('admin')),db: Session=Depends(get_db)):
    row=get_resource(db,model_id,'model')
    db.execute(select(Asset).where(Asset.id==row.data['asset_id']).with_for_update()).scalar_one()
    for prior in db.scalars(select(Resource).where(Resource.category=='model',Resource.status=='deployed')).all():
        if prior.data['asset_id']==row.data['asset_id'] and prior.data['metric']==row.data['metric']:
            prior.status='archived'
    row.status='deployed'
    audit(db,user.email,'model.deploy',row.id)
    db.commit()
    return resource_dict(row)

@app.get('/api/models/{model_id}/inference')
def inference(model_id:str,user:User=Depends(current_user),db:Session=Depends(get_db)):
    row=get_resource(db,model_id,'model')
    if row.status!='deployed':
        raise HTTPException(409,'배포된 모델만 추론할 수 있습니다.')
    asset=db.get(Asset,row.data['asset_id'])
    value=getattr(asset,row.data['metric'])
    score=abs(value-row.data['mean'])/row.data['std']
    return {'value':value,'z_score':round(score,3),'anomaly':score>row.data['threshold'],'threshold':row.data['threshold'],'asset_id':asset.id,'timestamp':asset.updated_at}

@app.post('/api/recommendations/{rid}/decision')
def decide(rid:str,body:DecisionInput,user:User=Depends(roles('admin')),db:Session=Depends(get_db)):
    row=get_resource(db,rid,'recommendation')
    result=db.execute(update(Resource).where(Resource.id==rid,Resource.status=='pending').values(status='approved' if body.decision=='approve' else 'rejected'))
    if result.rowcount!=1:
        raise HTTPException(409,'이미 처리된 제안입니다.')
    row.data={**row.data,'decided_by':user.email,'decided_at':now()}
    if body.decision=='approve':
        task=add_resource(db,'maintenance',row.name,'planned',{'asset_id':row.data['asset_id'],'recommendation_id':row.id,'description':row.data['reason']})
        row.data={**row.data,'task_id':task.id}
    audit(db,user.email,f'recommendation.{body.decision}',rid)
    db.commit()
    db.refresh(row)
    return resource_dict(row)

@app.post('/api/alerts/{rid}/ack')
def ack_alert(rid:str,user:User=Depends(roles('operator','admin')),db:Session=Depends(get_db)):
    row=get_resource(db,rid,'alert')
    if row.status!='open':
        raise HTTPException(409,'이미 확인된 알림입니다.')
    row.status='acknowledged'
    audit(db,user.email,'alert.acknowledge',rid)
    db.commit()
    return resource_dict(row)

@app.post('/api/orders',status_code=201)
def create_order(body:OrderInput,user:User=Depends(roles('operator','admin')),db:Session=Depends(get_db)):
    row=add_resource(db,'order',body.name,'planned',{**body.model_dump(),'completed':0})
    audit(db,user.email,'order.create',row.id)
    db.commit()
    return resource_dict(row)

@app.post('/api/orders/{rid}/start')
def start_order(rid:str,user:User=Depends(roles('operator','admin')),db:Session=Depends(get_db)):
    row=get_resource(db,rid,'order')
    # Lock the line's assets so two workers cannot start different orders on the same line.
    db.scalars(select(Asset).where(Asset.line==row.data['line']).order_by(Asset.id).with_for_update()).all()
    if row.status!='planned':
        raise HTTPException(409,'대기 상태의 작업만 시작할 수 있습니다.')
    active=db.scalars(select(Resource).where(Resource.category=='order',Resource.status=='running')).all()
    if any(o.data['line']==row.data['line'] for o in active):
        raise HTTPException(409,'라인에서 이미 작업이 진행 중입니다.')
    row.status='running'
    audit(db,user.email,'order.start',rid)
    db.commit()
    return resource_dict(row)

@app.post('/api/robot-jobs',status_code=201)
def robot_job(body:RobotInput,user:User=Depends(roles('operator','admin')),db:Session=Depends(get_db)):
    if not DEMO_MODE:
        raise HTTPException(409,'실장비 제어 어댑터가 없습니다. 가상 모드에서만 실행 가능합니다.')
    robots=db.scalars(select(Resource).where(Resource.category=='robot').order_by(Resource.id).with_for_update()).all()
    robot=next((r for r in robots if r.name==body.robot_id),None)
    if not robot:
        raise HTTPException(404,'등록되지 않은 로봇입니다.')
    if robot.status!='idle' or robot.data['battery']<20:
        raise HTTPException(409,'로봇이 대기 상태가 아니거나 배터리가 부족합니다.')
    robot.status='busy'
    row=add_resource(db,'job',f'{body.robot_id} → {body.destination}','running',{**body.model_dump(),'mode':'virtual','robot_resource':robot.id})
    audit(db,user.email,'robot.dispatch.virtual',row.id)
    db.commit()
    return resource_dict(row)

@app.post('/api/robot-jobs/{rid}/complete')
def complete_job(rid:str,user:User=Depends(roles('operator','admin')),db:Session=Depends(get_db)):
    row=get_resource(db,rid,'job')
    changed=db.execute(update(Resource).where(Resource.id==rid,Resource.status=='running').values(status='completed'))
    if changed.rowcount!=1:
        raise HTTPException(409,'실행 중인 작업만 완료할 수 있습니다.')
    robot=get_resource(db,row.data['robot_resource'],'robot')
    robot.status='idle'
    robot.data={**robot.data,'location':row.data['destination'],'battery':max(0,robot.data['battery']-3),'jobs':robot.data['jobs']+1}
    audit(db,user.email,'robot.complete.virtual',rid)
    db.commit()
    db.refresh(row)
    return resource_dict(row)

@app.post('/api/datasets',status_code=201)
def create_dataset(body:DatasetInput,user:User=Depends(roles('operator','admin')),db:Session=Depends(get_db)):
    simulation=get_resource(db,body.simulation_id,'simulation')
    row=add_resource(db,'dataset',f'{simulation.name} · 합성 운전 데이터','ready',{'simulation_id':simulation.id,'samples':body.samples,'cycle_time':simulation.data['optimized_cycle'],'line':simulation.data['line'],'method':'parametric-operating-data-v1','note':'시나리오 파라미터 기반 합성 표 데이터. 로봇 학습·물리 시뮬레이션 미포함.'})
    audit(db,user.email,'dataset.generate',row.id,body.model_dump())
    db.commit()
    return resource_dict(row)

@app.get('/api/datasets/{rid}/download')
def download_dataset(rid:str,user:User=Depends(current_user),db:Session=Depends(get_db)):
    row=get_resource(db,rid,'dataset')
    data='sample,cycle_time,temperature,vibration,synthetic\n'
    for i in range(row.data['samples']):
        data+=f'{i+1},{row.data["cycle_time"]*(1+.04*math.sin(i)):.3f},{48+3*math.sin(i/9):.3f},{1.2+.2*math.cos(i/5):.3f},true\n'
    return Response(data,media_type='text/csv',headers={'Content-Disposition':f'attachment; filename="{row.id}.csv"'})

@app.get('/api/audit')
def audit_log(user:User=Depends(roles('admin')),db:Session=Depends(get_db)):
    return [{c.name:getattr(r,c.name) for c in Audit.__table__.columns} for r in db.scalars(select(Audit).order_by(Audit.id.desc()).limit(200)).all()]
