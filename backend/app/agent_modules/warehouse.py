from .contracts import fact
from decimal import Decimal
from datetime import date,timedelta
from ..supply.engine import production_plan

def run(s,p,blackboard):
    supply=s.get('supply',{});locations=supply.get('locations',[]);occupied={b['location_id'] for b in supply.get('balances',[]) if Decimal(b['quantity'])>0}
    return fact(f"창고 {len({l['warehouse'] for l in locations})}개, 로케이션 {len(locations)}개 중 {len(occupied)}개에 재고가 있습니다.",{'warehouses':len({l['warehouse'] for l in locations}),'locations':len(locations),'occupied_bins':len(occupied)},[l['id'] for l in locations],['적치 로케이션 수 기준입니다. 부피·중량 수용능력이나 랙 적재율을 의미하지 않습니다.'])
