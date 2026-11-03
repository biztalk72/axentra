"""커넥터 구성과 실제 수집 이력을 구분합니다."""
from .contracts import fact

def run(s, p, blackboard):
    rows=s['connectors']
    return fact(f"커넥터 구성 {len(rows)}건, 라인 수집 이력 {len(s['events'])}건을 확인했습니다.",{'connectors':len(rows),'events':len(s['events'])},[r['id'] for r in rows],['커넥터 구성 등록은 현장 프로토콜 연결 성공을 의미하지 않습니다.'])
