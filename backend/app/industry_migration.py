"""One-time, non-destructive conversion of the known synthetic legacy factory."""
import json
from pathlib import Path
from sqlalchemy import select,update,delete
from .db import Asset,Telemetry,Resource
from .services import audit


def migrate_ramen_demo(db):
    if db.get(Resource,'RAMEN-DEMO-V1'):return
    catalog=json.loads((Path(__file__).parent/'supply/assets.json').read_text())
    rows={a.id:a for a in db.scalars(select(Asset)).all()}
    if not all(a['legacy_id'] in rows for a in catalog):return
    if any(a['id'] in rows for a in catalog):return
    mapping={a['legacy_id']:a['id'] for a in catalog}
    def convert(value):
        if isinstance(value,dict):return {k:convert(v) for k,v in value.items()}
        if isinstance(value,list):return [convert(v) for v in value]
        if isinstance(value,str):
            for old,new in mapping.items():value=value.replace(old,new)
            return value.replace('가공 A라인','제면 A라인').replace('조립 B라인','스프 B라인').replace('스핀들','구동부')
        return value
    for item in catalog:
        old=rows[item['legacy_id']];data={c.name:getattr(old,c.name) for c in Asset.__table__.columns};data.update(id=item['id'],name=item['name'],kind=item['kind']);db.add(Asset(**data))
    db.flush()
    for old,new in mapping.items():db.execute(update(Telemetry).where(Telemetry.asset_id==old).values(asset_id=new))
    # Saved agent reports, experiments and audit records retain their original snapshot.
    for row in db.scalars(select(Resource).where(Resource.category.in_(['order','model','alert','recommendation','maintenance','job']))).all():
        row.data=convert(row.data);row.name=convert(row.name)
        replacements={'11월 모터 하우징 생산':('순한맛 봉지라면 생산','순한맛 봉지라면 120g'),'배터리 모듈 브래킷':('분말스프 소포장 생산','분말스프 10g 소포장'),'정밀 기어 샤프트':('건면 라면 생산 준비','건면 라면 100g')}
        if row.category=='order' and row.name in replacements:row.name,product=replacements[row.name];row.data={**row.data,'product':product}
    for run in db.scalars(select(Resource).where(Resource.category=='agent_run',Resource.status.in_(['queued','running','paused']))).all():
        run.data={**run.data,'migration_blocked':True,'pause_reason':'업종 전환 이전 설비 키의 실행입니다. 새 진단을 시작하세요.'}
    db.flush();db.execute(delete(Asset).where(Asset.id.in_(mapping)))
    db.add(Resource(id='RAMEN-DEMO-V1',category='industry_migration',name='라면 합성 공정 전환',status='completed',data={'asset_mapping':mapping,'history_preserved':True}))
    audit(db,'system','industry.demo.migrate','ramen',{'asset_mapping':mapping,'history_preserved':True})
