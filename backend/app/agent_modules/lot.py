from .contracts import fact
from decimal import Decimal
from datetime import date,timedelta
from ..supply.engine import production_plan

def run(s,p,blackboard):
    supply=s.get('supply',{});today=date.fromisoformat(s['captured_at'][:10]);stocked={b['lot_id'] for b in supply.get('balances',[]) if Decimal(b['quantity'])>0};rows=[l for l in supply.get('lots',[]) if l['id'] in stocked];expired=[l for l in rows if l.get('expires_on') and l['expires_on']<today.isoformat()];soon=[l for l in rows if l.get('expires_on') and today<=date.fromisoformat(l['expires_on'])<=today+timedelta(days=p['expiry_days'])];held=[l for l in rows if l['status']!='released']
    return fact(f"재고 LOT {len(rows)}개: 보류/차단 {len(held)}개, 기한 경과 {len(expired)}개, 임박 {len(soon)}개입니다.",{'stocked_lots':len(rows),'held_lots':len(held),'expired_lots':len(expired),'expiring_lots':len(soon)},sorted({l['id'] for l in held+expired+soon}) or list(stocked),['등록된 상태·기한에 따른 점검입니다. 사용 승인은 담당자의 별도 판단입니다.'])
