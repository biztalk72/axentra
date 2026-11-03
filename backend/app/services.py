import math
import uuid
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .db import Asset, Resource, Telemetry, Audit, now

def identifier(prefix):
    return f'{prefix}-{uuid.uuid4().hex[:10].upper()}'

def resource_dict(row):
    return {'id':row.id,'name':row.name,'status':row.status,'created_at':row.created_at,**row.data}

def asset_dict(row):
    return {c.name:getattr(row,c.name) for c in Asset.__table__.columns}

def audit(db, actor, action, target, detail=None):
    db.add(Audit(actor=actor, action=action, target=target, detail=detail or {}))

def add_resource(db, category, name, status, data):
    row=Resource(id=identifier(category[:3].upper()), category=category, name=name, status=status, data=data)
    db.add(row)
    return row

def get_resource(db, rid, category):
    row=db.get(Resource, rid)
    if not row or row.category != category:
        raise HTTPException(404, '항목을 찾을 수 없습니다.')
    return row

def analyze_asset(db, asset):
    if asset.temperature > 75 or asset.vibration > 3.5:
        asset.status = 'warning'
        pending=db.scalars(select(Resource).where(Resource.category=='alert', Resource.status=='open')).all()
        if not any(r.data['asset_id']==asset.id for r in pending):
            metric='temperature' if asset.temperature>75 else 'vibration'
            value=getattr(asset, metric)
            alert=add_resource(db,'alert',f'{asset.id} {"온도" if metric=="temperature" else "진동"} 이상','open',{'asset_id':asset.id,'severity':'warning','metric':metric,'value':value,'threshold':75 if metric=='temperature' else 3.5,'message':'운영 임계값을 초과했습니다. 점검을 요청하세요.'})
            db.flush()
            add_resource(db,'recommendation',f'{asset.id} 예방 점검 작업 생성','pending',{'asset_id':asset.id,'alert_id':alert.id,'reason':f'{metric}={value:.1f}, 운영 임계값 초과','action':'maintenance','impact':'예방 점검 작업 지시 생성 · 설비 자동 제어 없음','engine':'threshold-rule-v1'})
    elif asset.status != 'maintenance':
        asset.status='running'

def ingest(db: Session, events):
    accepted=duplicates=late=0
    # A single ordered transaction: lock assets first and protect dedupe with unique key.
    asset_ids=sorted(set(e.asset_id for e in events))
    assets={a.id:a for a in db.scalars(select(Asset).where(Asset.id.in_(asset_ids)).order_by(Asset.id).with_for_update()).all()}
    if len(assets)!=len(asset_ids):
        raise HTTPException(404,'등록되지 않은 설비가 포함되어 있습니다.')
    for event in events:
        existing=db.scalar(select(Telemetry.id).where(Telemetry.source==event.source,Telemetry.event_id==event.event_id))
        if existing:
            duplicates+=1
            continue
        timestamp=(event.timestamp or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat()
        if event.timestamp and event.timestamp > datetime.now(timezone.utc):
            raise HTTPException(422,'미래 시각의 이벤트는 수집할 수 없습니다.')
        asset=assets[event.asset_id]
        db.add(Telemetry(event_id=event.event_id,source=event.source,asset_id=asset.id,temperature=event.temperature,vibration=event.vibration,good=event.good,rejected=event.rejected,timestamp=timestamp))
        asset.produced+=event.good
        asset.rejected+=event.rejected
        if datetime.fromisoformat(timestamp)>=datetime.fromisoformat(asset.updated_at):
            asset.temperature=event.temperature
            asset.vibration=event.vibration
            asset.updated_at=timestamp
            analyze_asset(db,asset)
        else:
            late+=1
        accepted+=1
        db.flush()
        # Count accepted production against the current active work order only.
        orders=db.scalars(select(Resource).where(Resource.category=='order',Resource.status=='running').order_by(Resource.created_at).with_for_update()).all()
        order=next((o for o in orders if o.data['line']==asset.line),None)
        # Final station emits line output; avoid counting every processing station as a finished product.
        if order and asset.kind in ('QC','Packaging'):
            data=dict(order.data)
            data['completed']=min(data['quantity'],data['completed']+event.good)
            order.data=data
            if data['completed']>=data['quantity']:
                order.status='completed'
    connectors=db.scalars(select(Resource).where(Resource.category=='connector')).all()
    for conn in connectors:
        if conn.data.get('driver')=='demo-rest':
            conn.data={**conn.data,'last_seen':now()}
    return {'accepted':accepted,'duplicates':duplicates,'late':late}

def calculate_simulation(db, request):
    assets=db.scalars(select(Asset).where(Asset.line==request.line)).all()
    if not assets:
        raise HTTPException(404,'라인에 설비가 없습니다.')
    bottleneck=max(assets,key=lambda a:a.cycle_time)
    cycle=bottleneck.cycle_time
    baseline=math.floor(request.hours*3600/cycle*.90*.98)
    optimized=math.floor(request.hours*3600/(cycle*(1-request.cycle_reduction/100))*(1-request.downtime/100)*(1-request.defect_rate/100))
    return {'baseline':baseline,'optimized':optimized,'improvement':round((optimized/baseline-1)*100,1),'bottleneck':bottleneck.id,'baseline_cycle':cycle,'optimized_cycle':round(cycle*(1-request.cycle_reduction/100),2),'method':'deterministic-capacity-v1','assumptions':'직렬 공정, 병목 주기 기반 처리량; 기준 비가동 10%, 불량률 2%; 버퍼·고장 분포·물리 엔진 미포함'}
