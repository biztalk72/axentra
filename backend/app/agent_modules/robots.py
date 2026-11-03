"""공용 가상 로봇 상태와 저전압 대상을 확인합니다."""
from .contracts import fact

def run(s, p, blackboard):
    rows=s['robots']; low=[r for r in rows if r.get('battery',0)<p['min_battery']]
    return fact(f"공용 가상 AMR {len(rows)}대 중 배터리 {p['min_battery']}% 미만 {len(low)}대입니다.",{'robots':len(rows),'low_battery':len(low),'jobs':len(s['jobs'])},[r['id'] for r in rows],['공용 가상 로봇 기준. 배정·이동·충전 명령은 실행하지 않습니다.'])
