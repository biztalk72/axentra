# 데이터 거버넌스·레이크하우스 연동 준비

**데이터 카탈로그·연동**에서 데이터 제품 8종(위치·LOT 재고, LOT, BOM, 수불, 생산 배치, 품목, 로케이션, 설비 이벤트)의 스키마·소유자·steward·분류·grain·기본키·계보·품질 규칙을 조회한다. JSONL 데이터와 manifest를 내려받아 후속 플랫폼의 수집 계약으로 사용할 수 있다. 설비 이벤트 export는 after_id/limit 커서를 제공한다. 공급망 export는 단일 원장 스냅샷이다. 외부 거버넌스 제품이나 레이크하우스에 자동 등록하는 기능은 아직 없다.

## 이벤트와 전송 보장

재고·LOT·BOM·마스터 변경 및 실제 REST 수집으로 새로 승인된 설비 이벤트는 업무 커밋과 같은 트랜잭션에 outbox를 남긴다. 거부·중복 입력은 이벤트를 추가하지 않는다. 지속적인 합성 demo-gateway 스트림은 outbox에서 제외한다.

메시지는 specversion/id/type/source/subject/time/dataschema/data와 industry, governance 메타데이터를 가진다. UTC ISO8601, 기준 단위 수량 문자열(scale 3), internal 분류와 schema_version=1을 사용한다. `quality_status=validated`는 애플리케이션 입력 규칙 통과를 뜻하며 외부 품질 인증이나 데이터 정확성 보증이 아니다. 소비자는 event.id로 중복 제거해야 한다.

관리자 **대기 이벤트 전송·재시도**는 선택한 MQTT 또는 Kafka 플러그인 하나에 최대 5건을 명시적으로 전송한다. 기본 비활성 상태다. MQTT QoS 1 PUBACK 또는 Kafka delivery callback ACK 후에만 delivered로 기록한다. 실패는 failed와 시도 횟수를 남기며 같은 ID로 재시도한다. 브로커 성공 후 DB 커밋 전 중단 시 재전송될 수 있는 at-least-once 방식이다. 자동 워커·분산 재시도 스케줄·DLQ·보관 주기·커넥터별 offset 관리와 운영 모니터링은 확장 대상이다. 브로커 ACK는 최종 레이크하우스 적재 성공을 뜻하지 않는다.

## MQTT / Kafka 설치

기본 설치는 SDK 없이도 카탈로그·outbox·export를 제공한다.

```bash
uv sync --directory backend --frozen --extra integrations
# Docker: 선택형 SDK와 내부 검증용 MQTT 브로커 포함
INSTALL_INTEGRATIONS=true docker compose --profile integration up --build -d api web mqtt
```

- MQTT: `mqtts://broker:8883`, topic, QoS 1. mqtts는 시스템 CA로 인증서를 검증한다. 내부 Compose 검증 브로커는 `mqtt://mqtt:1883`이며 호스트 포트를 노출하지 않는다. 익명 내부 검증용이며 외부 운영 브로커로 그대로 공개하지 않는다.
- Kafka: `broker-1:9093,broker-2:9093`, topic, TLS 선택. acks=all, idempotent producer, delivery callback을 사용한다. 선택적 SASL/PLAIN 자격증명을 환경변수에서 읽는다.
- 화면에는 암호를 넣지 않는다. `INTEGRATION_BROKER_USERNAME`, `INTEGRATION_BROKER_PASSWORD` 같은 환경변수 **이름**만 저장한다. Compose는 이 두 변수를 API 컨테이너에 전달한다. 다른 INTEGRATION_ 접두사 변수는 배포 환경에서 별도로 주입한다. URL 내 자격증명과 ADMIN_PASSWORD 같은 다른 용도의 변수 참조를 거부한다.
- SDK 설치됨 표시는 연결 성공이 아니다. 필요한 CA·인증·네트워크·topic 권한을 실제 현장 브로커에서 구성해야 한다.

## 읽기 전용 MCP 브리지

[공식 MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)의 FastMCP stdio 서버를 별도 프로세스로 실행한다.

```bash
# 환경에서 FORGE_API_TOKEN을 기존 로그인 세션의 bearer 값으로 안전하게 주입
export FORGE_API_URL=http://127.0.0.1:8088
cd backend
.venv/bin/python -m app.integration_plugins.mcp_server
```

도구: `read_data_catalog`, `read_inventory`, `trace_lot(lot_id)`, `read_industry_profile`. 고정된 GET 경로만 호출하고 LOT ID 형식을 제한한다. 등록·수정·출고·장비 제어 도구는 없다. 세션 토큰을 로그·저장소·공개 Pages에 넣지 않는다. API의 기존 인증·권한·8시간 세션 만료를 그대로 적용하며 만료 시 인증을 갱신해야 한다. 운영용 서비스 계정·토큰 발급·세분화된 scope/자산 격리는 후속 설계다. 도구가 읽기 전용이어도 제공한 토큰 자체의 API 권한이 축소되는 것은 아니다.

## 후속 솔루션 연결 경계

```text
품목/수불/생산/수집 API → DB 원장 + outbox → MQTT/Kafka → 수집/검증 → lakehouse
                         ↓ export+manifest                 ↓
                    데이터 제품 카탈로그 ← 외부 거버넌스 매핑
인증된 읽기 API ← MCP stdio 도구 ← 승인된 AI 클라이언트
```

외부 플랫폼별 connector와 schema registry, CDC, 오브젝트 저장소, 테이블 포맷(Iceberg/Delta 등), 암호화 키·보존·계보 수집·접근 정책은 환경이 정해진 뒤 붙인다. 현재 catalog의 owner/steward/classification은 계약 메타데이터이며 외부 정책 엔진이나 자동 민감정보 분류는 아니다.

Pages는 브라우저 원장·카탈로그·outbox 미리보기를 제공하며 브로커나 로컬 MCP 서버에 접속하지 않는다. 실제 전송 버튼은 서버 연결 환경에서만 사용한다.

검증: 로컬 Mosquitto에서 QoS 1 PUBACK과 구독자의 같은 event.id 수신을 확인했다. MCP SDK 실제 stdio handshake/4개 도구/재고·다단계 LOT 조회를 확인했다. Kafka ACK/실패/미수신/보류 계약은 자동 테스트하며 실제 외부 Kafka 클러스터 연결은 미검증이다.

참조: [Paho MQTT 공식 문서](https://eclipse.dev/paho/clients/python/docs/), [Confluent Python client](https://docs.confluent.io/kafka-clients/python/current/index.html).
