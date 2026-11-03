"""설비 맵과 현재 운전 상태를 확인합니다."""
from .contracts import fact

def run(s, p, blackboard):
    rows=s['assets']; warning=sum(a['status']=='warning' for a in rows)
    return fact(f"2D 설비 맵 {len(rows)}대 중 주의 상태 {warning}대입니다.",{'assets':len(rows),'warnings':warning},[a['id'] for a in rows],['현재 설비 상태를 확인합니다. 3D 물리 시뮬레이션은 실행하지 않습니다.'])
