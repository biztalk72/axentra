from .contracts import fact
from decimal import Decimal
from datetime import date,timedelta
from ..supply.engine import production_plan

def run(s,p,blackboard):
    supply=s.get('supply',{});skus={r['id']:r for r in supply.get('skus',[])};lots={r['id']:r for r in supply.get('lots',[])};locations={r['id']:r for r in supply.get('locations',[])}
    bad=[b for b in supply.get('balances',[]) if Decimal(b['quantity'])>0 and skus[lots[b['lot_id']]['sku_id']]['category'] not in locations[b['location_id']]['allowed_categories']]
    return fact(f"품목 분류와 로케이션 적치 규칙 불일치 {len(bad)}건입니다.",{'classified_skus':len(skus),'misplaced_stock':len(bad)},sorted({b['lot_id'] for b in bad}) or list(skus),['마스터 분류·창고 규칙에 따른 점검입니다. 영상/AI 자동 분류가 아닙니다.'])
