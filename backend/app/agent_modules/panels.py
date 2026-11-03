"""라인 패널의 게시 상태와 구성 리비전을 확인합니다."""
from .contracts import fact

def run(s, p, blackboard):
    rows=s['panels']; pending=sum(not r['published'] or r['revision']!=r['published_revision'] for r in rows)
    return fact(f"라인 패널 {len(rows)}개, 미게시 또는 변경 초안 {pending}개입니다.",{'panels':len(rows),'draft_panels':pending},[r['id'] for r in rows],['게시 설정을 확인합니다. 실제 장치 연결은 하트비트로 별도 확인합니다.'])
