"""통계 모델의 학습·배포 메타데이터를 확인합니다."""
from .contracts import fact

def run(s, p, blackboard):
    rows=s['models']; deployed=sum(r['status']=='deployed' for r in rows)
    return fact(f"라인 관련 통계 모델 {len(rows)}건, 배포 모델 {deployed}건입니다.",{'models':len(rows),'deployed_models':deployed},[r['id'] for r in rows],['모델 메타데이터 진단입니다. 학습·배포를 자동 실행하거나 예측 성능을 주장하지 않습니다.'])
