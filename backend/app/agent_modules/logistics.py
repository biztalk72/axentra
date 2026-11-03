"""공용 AMR와 현장 지원 요청을 확인합니다."""
from .contracts import fact

def run(s, p, blackboard):
    idle=sum(r['status']=='idle' for r in s['robots']); pending=sum(not r['published'] for r in s['panels'])
    return fact(f"공용 AMR {idle}대 대기, 미게시 패널 {pending}개, 현장 입력 {len(s['floor_events'])}건을 확인했습니다.",{'idle_robots':idle,'unpublished_panels':pending,'cameras':len(s['cameras']),'requests':len(s['floor_events'])},[r['id'] for r in s['panels']]+[r['id'] for r in s['cameras']],['공용 가상 AMR 기준. 실제 장비 명령을 실행하지 않습니다.'])
