# API 계약과 예제

로컬 API 문서: http://127.0.0.1:8000/docs · Compose: http://127.0.0.1:8088/docs

로그인 `POST /api/auth/login`: `{ "email":"admin@admin.com", "password":"<ADMIN_PASSWORD 환경설정 값>" }`. 반환한 `access_token`을 `Authorization: Bearer <token>` 헤더에 사용한다. 관리자 암호 원문을 문서·공개 저장소에 저장하지 않는다.

가입 `POST /api/auth/register`: `{ "name":"체험 사용자", "email":"trial@example.com", "password":"<8~128자, 영문·숫자>", "password_confirm":"<동일한 암호>" }`. 성공은 201이며 operator 역할의 사용자와 로그인 토큰을 반환한다. 이름·이메일 정규화, 중복·예약 주소·확인값 검사를 적용한다. 임의 역할 필드는 422, 중복은 409, 가입 비활성화는 403이다. 자세한 흐름은 [계정 가이드](ACCOUNTS.md)를 따른다.

| 경로 | 메서드 | 최소 역할 | 기능 |
|---|---|---|---|
| /health | GET | 익명 | DB health, demo/stream/registration_enabled 여부 |
| /api/auth/register | POST | 익명 | 일반 사용자 가입 + 8시간 세션 |
| /api/auth/login | POST | 익명 | 8시간 세션 |
| /api/users | GET | admin | 이름·이메일·역할 목록 |
| /api/auth/me, /api/auth/logout | GET, POST | viewer | 사용자, 세션 폐기 |
| /api/overview, /api/assets | GET | viewer | KPI와 설비 |
| /api/resources/{category} | GET | viewer | 최근 200개 범주별 업무 리소스 |
| /api/telemetry | GET | viewer | asset_id, limit 1~1000 |
| /api/telemetry/export | GET | viewer | 최근 10,000개 CSV |
| /api/telemetry/batch | POST | operator | 1~500개 배치 수집 |
| /api/demo/tick | POST | operator | DEMO_MODE일 때 샘플 수집 |
| /api/connectors | POST | admin | 구성 정보 등록 |
| /api/simulations | POST | operator | 병목 용량 시뮬레이션 |
| /api/models/train | POST | operator | Gaussian z-score 학습 |
| /api/models/{id}/deploy | POST | admin | 통계 모델 배포 |
| /api/models/{id}/inference | GET | viewer | 현재값 이상 판정 |
| /api/recommendations/{id}/decision | POST | admin | approve / reject |
| /api/alerts/{id}/ack | POST | operator | 알림 확인 |
| /api/orders, /api/orders/{id}/start | POST | operator | 작업지시 생성 / 시작 |
| /api/robot-jobs | POST | operator | 가상 로봇 작업 배정 |
| /api/robot-jobs/{id}/complete | POST | operator | 가상 완료 처리 |
| /api/datasets | POST | operator | 실험 기반 합성 데이터셋 생성 |
| /api/datasets/{id}/download | GET | viewer | 합성 CSV |
| /api/audit, /metrics | GET | admin | 감사로그, Prometheus metrics |

admin은 모든 역할의 작업을 수행한다. 직접 가입한 계정은 operator로 고정한다. 테스트용 viewer는 테스트 fixture에서만 생성한다. ALLOW_REGISTRATION=false이면 가입을 차단한다.

수집 예시:

```json
{
  "events": [
    {
      "event_id": "line-a-000001",
      "source": "edge-gateway-01",
      "asset_id": "CNC-001",
      "temperature": 48.2,
      "vibration": 1.1,
      "good": 5,
      "rejected": 0
    }
  ]
}
```

`timestamp`를 생략하면 서버 현재 시각을 사용한다. 제공하면 timezone이 필요하고 미래 시각은 거부한다. 값은 수량 증분이다. 반환: `{accepted,duplicates,late}`. 재전송은 source/event_id가 같아야 하며 다른 페이로드라도 같은 ID이면 기존 이벤트로 처리한다. 원시 데이터 정정은 별도 API가 필요하다.

오류: 401 미인증, 403 권한, 404 없는 대상, 409 상태·동시성 충돌, 422 스키마·범위 위반. 409 수집 충돌 시 동일 event_id로 재시도한다. 승인·작업 완료는 재시도 시 409를 반환하므로 GET으로 최종 상태를 확인한다.

전체 스키마: 실행 중인 `/openapi.json`. 정적 Pages에는 실제 HTTP API가 없으며 `src/demo.ts`의 브라우저 어댑터가 화면 동작만 재현한다.
