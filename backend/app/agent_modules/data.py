"""수집 이벤트와 라인 데이터 범위를 확인합니다."""
from .contracts import fact

def run(s, p, blackboard):
    assets=s['assets']; ids=[a['id'] for a in assets]
    return fact(f"{s['line']}라인 설비 {len(assets)}대, 최근 이벤트 {len(s['events'])}건의 공통 스냅샷을 확인했습니다.", {'assets':len(assets),'events':len(s['events'])},ids,[f"기준 시각 {s['captured_at']}",'모든 워커가 같은 시점의 스냅샷을 사용합니다.'])
