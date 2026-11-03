from .contracts import fact
from decimal import Decimal
from datetime import date,timedelta
from ..supply.engine import production_plan

def run(s,p,blackboard):
    rows=[a for a in s['assets'] if a['id'].startswith('NDL-')];orders=[o for o in s['orders'] if o['status']=='running'] if rows else []
    return fact(f"선택 라인의 제면·포장 설비 {len(rows)}대, 진행 작업 {len(orders)}건입니다.",{'process_assets':len(rows),'active_orders':len(orders)},[a['id'] for a in rows],[s.get('industry',{}).get('lines',[{}])[0].get('description','배합·반죽 → 압연·절출 → 증숙·건조 → 포장'),'합성 설비 상태 진단이며 공정 제어·식품 안전 판정은 수행하지 않습니다.'])
