from .contracts import fact
from decimal import Decimal
from datetime import date,timedelta
from ..supply.engine import production_plan

def run(s,p,blackboard):
    supply=s.get('supply',{});rows=supply.get('boms',[]);plans=[production_plan(supply,{'bom_id':b['id'],'bom_revision':b['revision'],'quantity':b['output_quantity']},s['captured_at'][:10]) for b in rows];short=[p for p in plans if not p['ready']]
    return fact(f"BOM {len(rows)}종 중 기준 배치의 가용 자재가 부족한 BOM은 {len(short)}종입니다.",{'boms':len(rows),'shortage_boms':len(short),'bom_components':sum(len(b['components']) for b in rows)},[b['bom_id'] for b in short] or [b['id'] for b in rows],['각 BOM의 기준 생산량으로 독립 계산합니다. 여러 생산 계획의 동시 예약·납기 MRP는 수행하지 않습니다.'])
