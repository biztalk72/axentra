from .contracts import fact
from decimal import Decimal
from datetime import date,timedelta
from ..supply.engine import production_plan

def run(s,p,blackboard):
    today=s['captured_at'][:10];supply=s.get('supply',{});lots={l['id']:l for l in supply.get('lots',[])};available={sku['id']:Decimal(0) for sku in supply.get('skus',[])}
    for stock in supply.get('balances',[]):
        lot=lots[stock['lot_id']]
        if lot['status']=='released' and (not lot.get('expires_on') or lot['expires_on']>=today):available[lot['sku_id']]+=Decimal(stock['quantity'])
    low=[sku for sku in supply.get('skus',[]) if available[sku['id']]<Decimal(sku['min_stock'])*Decimal(str(p['coverage_factor']))]
    return fact(f"품목 {len(available)}종 중 사용 가능 재고가 기준 미만인 품목은 {len(low)}종입니다.",{'skus':len(available),'low_stock_skus':len(low),'stock_lines':sum(Decimal(b['quantity'])>0 for b in supply.get('balances',[]))},[x['id'] for x in low] or list(available),[f"{sku['name']}: {available[sku['id']]} {sku['unit']} / 최소 {sku['min_stock']} {sku['unit']}" for sku in supply.get('skus',[])]+['품목별 단위로 비교합니다. 서로 다른 kg·ea·box 수량을 합산하지 않습니다.'])
