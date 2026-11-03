"""합성 데이터셋과 실험 가정을 확인합니다."""
from .contracts import fact

def run(s, p, blackboard):
    rows=s['datasets']
    return fact(f"라인 실험 기반 합성 데이터셋 {len(rows)}건을 확인했습니다.",{'datasets':len(rows),'simulations':len(s['simulations'])},[r['id'] for r in rows],['합성 표 데이터 메타데이터입니다. 물리 엔진·정책 학습을 실행하지 않습니다.'])
