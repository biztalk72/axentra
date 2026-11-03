"""설비 누적 양품률과 불량 수량을 분석합니다."""
from .contracts import fact

def run(s, p, blackboard):
    good=sum(a['produced'] for a in s['assets']); bad=sum(a['rejected'] for a in s['assets']); quality=round(good/max(good+bad,1)*100,2)
    return fact(f"설비 누적 양품률은 {quality}%입니다. 목표 {p['target_quality']}% 대비 {'충족' if quality>=p['target_quality'] else '미달'}입니다.",{'good':good,'rejected':bad,'quality':quality,'target_quality':p['target_quality']},[a['id'] for a in s['assets']],['전체 설비 처리 수량 기준. 완제품 합산 실적이나 고장 예측 정확도가 아닙니다.'])
