"""작업지시와 직렬 공정 병목 용량을 확인합니다."""
from .contracts import fact

def run(s, p, blackboard):
    assets=s['assets']; bottleneck=max(assets,key=lambda a:a['cycle_time']); active=[o for o in s['orders'] if o['status']=='running']; baseline=int(8*3600/bottleneck['cycle_time']*.9*.98); optimized=int(8*3600/(bottleneck['cycle_time']*.85)*.95*.985)
    return fact(f"병목 주기 설비는 {bottleneck['id']}입니다. 진행 중인 작업은 {len(active)}건입니다.",{'baseline_ea':baseline,'scenario_ea':optimized,'cycle_time':bottleneck['cycle_time']},[bottleneck['id']]+[o['id'] for o in active],['8시간·직렬 공정 모델. 기준 비가동 10%/불량 2%, 변경 주기 15% 단축/비가동 5%/불량 1.5%. 실제 성능 보장 아님.'])
