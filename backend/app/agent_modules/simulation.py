"""입력 가정에 따른 생산 용량을 비교합니다."""
from .contracts import fact

def run(s, p, blackboard):
    a=max(s['assets'],key=lambda a:a['cycle_time']); baseline=int(p['hours']*3600/a['cycle_time']*.9*.98); scenario=int(p['hours']*3600/(a['cycle_time']*(1-p['cycle_reduction']/100))*.95*.985)
    return fact(f"{p['hours']}시간·주기 {p['cycle_reduction']}% 단축 가정의 생산 용량은 {scenario}ea입니다.",{'baseline_ea':baseline,'scenario_ea':scenario,'hours':p['hours'],'cycle_reduction':p['cycle_reduction']},[a['id']],['직렬 공정 용량 계산입니다. 새 실험 리소스를 저장하거나 실제 공정을 변경하지 않습니다.'])
