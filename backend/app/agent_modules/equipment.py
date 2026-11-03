"""온도·진동 기준으로 점검 대상을 제안합니다."""
from .contracts import fact

def run(s, p, blackboard):
    assets=s['assets']; warnings=[a for a in assets if a['temperature']>p['temperature_threshold'] or a['vibration']>p['vibration_threshold']]
    result=fact(f'운영 임계값을 초과한 설비가 {len(warnings)}대입니다.',{'warnings':len(warnings)},[a['id'] for a in warnings] or [a['id'] for a in assets],[f"기준: 온도 {p['temperature_threshold']}°C / 진동 {p['vibration_threshold']} mm/s"]+[f"{a['id']}: {a['temperature']:.1f}°C / {a['vibration']:.2f} mm/s" for a in assets])
    result['maintenance_assets']=[a['id'] for a in warnings]
    return result
