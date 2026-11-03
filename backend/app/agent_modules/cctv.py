"""카메라 설정과 모의·실영상 소스를 분류합니다."""
from .contracts import fact

def run(s, p, blackboard):
    rows=s['cameras']; active=[r for r in rows if r['enabled']]; demo=sum(r['source_type']=='demo' for r in active)
    return fact(f"활성 카메라 {len(active)}개 중 모의 소스 {demo}개입니다.",{'cameras':len(rows),'active_cameras':len(active),'demo_cameras':demo},[r['id'] for r in rows],['소스 설정만 분석합니다. 영상 AI 분석이나 실제 재생 연결 확인은 수행하지 않습니다.'])
