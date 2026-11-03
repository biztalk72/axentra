from .contracts import fact
from decimal import Decimal
from datetime import date,timedelta
from ..supply.engine import production_plan

def run(s,p,blackboard):
    rows=[a for a in s['assets'] if a['id'].startswith('SUP-')];orders=[o for o in s['orders'] if o['status']=='running'] if rows else []
    return fact(f"선택 라인의 스프 생산·소포장 설비 {len(rows)}대, 진행 작업 {len(orders)}건입니다.",{'process_assets':len(rows),'active_orders':len(orders)},[a['id'] for a in rows],['스프 배합 → 분쇄·체질 → 정량 충전 → 소포장','설비 상태와 LOT·BOM 배합 이력은 별도 원장으로 확인합니다.'])
