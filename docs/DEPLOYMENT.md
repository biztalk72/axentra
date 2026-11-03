# Docker 배포

독립 배포 구성은 `compose.production.yaml`이다. 기존 라면 체험용 `compose.yaml`과 별도 프로젝트·DB 볼륨으로 실행한다. 기본 접속은 http://127.0.0.1:8090 이며 기존 체험 콘솔 8088과 함께 사용할 수 있다.

## 준비와 실행

Docker Engine + Compose v2 이상이 필요하다. 저장소 루트에서 실행한다.

```bash
cp .env.production.example .env.production
chmod 600 .env.production
# .env.production의 POSTGRES_PASSWORD / ADMIN_PASSWORD / CORS_ORIGINS를 설정
# DB 암호는 DATABASE_URL에 포함되므로 URL-safe 영문·숫자 권장
./scripts/verify-production.sh
```

이 작업 환경에는 기존 관리자 계정을 유지한 비공개 `.env.production`을 준비했다. 이미 파일이 있으면 예제로 덮어쓰지 않는다. 환경 파일·DB 덤프는 Git에서 제외한다.

검증 스크립트는 이미지 빌드 → DB/API/웹 healthy 대기 → 비루트·읽기 전용 실행, 합성 스트림 중지, 프록시·관리자 로그인/로그아웃, favicon·정적 파일 캐시/404를 확인한다. 제조 기록을 쓰거나 지우지 않으며 종료 후 서비스는 실행 상태로 남는다.

직접 실행하려면:

```bash
docker compose --env-file .env.production -f compose.production.yaml up --build -d --wait
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs -f api web
```

단일 서버의 단일 API 인스턴스용 구성이다. API 시작 시 Alembic migration 후 Uvicorn을 실행한다. Nginx는 Docker DNS를 다시 조회해 API 컨테이너 교체 시 주소 변경을 반영한다. 관리자는 ADMIN_EMAIL/ADMIN_PASSWORD로 초기화하며 값 변경 시 기존 관리자 세션을 폐기한다. DB 볼륨은 컨테이너 재생성과 일반 down에서 유지된다.

## 체험과 배포의 차이

| 항목 | 체험 compose.yaml | 배포 compose.production.yaml |
|---|---|---|
| 프로젝트 / 기본 포트 | forge-ax / 8088 | forge-ax-production / 8090 |
| 제조 데이터 | 라면 합성 seed·가상 스트림 | DEMO_MODE/DEMO_STREAM=false 고정 |
| 신규 DB | 데모 공정·재고 생성 | 관리자·공통 구성만 생성, 현장 데이터 별도 등록/이관 |
| 가입 | 기본 허용 | 기본 비허용, ALLOW_REGISTRATION=true로 운영자 직접 가입 허용 |
| 선택형 SDK | 기본 미설치 | MQTT/Kafka/MCP 기본 설치, 전송은 기본 비활성 |
| 웹/API 런타임 | 비루트 | 비루트·read-only rootfs·임시 /tmp·cap_drop·no-new-privileges |
| DB / API 포트 | Docker 내부 | Docker 내부 |
| 로그 | 기본 | JSON 로그 파일당 10MB, 3개 순환 |

배포 모드는 실제 설비·공급망 데이터를 자동 생성하지 않는다. 기존 체험 데이터가 필요하면 체험 Compose를 사용한다. 업종 공정 프로필을 편집하는 것만으로 PLC/ERP 연결이 생기지는 않는다.

HTTPS는 기존 ingress 또는 호스트 reverse proxy에서 종료하고 127.0.0.1:8090으로 전달한다. CORS_ORIGINS는 실제 HTTPS origin으로 설정한다. 컨테이너는 인증서나 도메인을 임의 발급하지 않는다. 외부 Ollama는 해당 서버에서 접근 가능한 LLM_BASE_URL을 설정한다. MQTT/Kafka 자격증명과 MCP 실행은 [연동 가이드](INTEGRATIONS.md)를 따른다. 배포 Compose에는 익명 검증용 브로커를 포함하지 않는다.

## 업데이트와 데이터 보존

```bash
git pull --ff-only
# 필요하면 .env.production의 IMAGE_TAG를 릴리스 식별자로 변경
./scripts/verify-production.sh
# 일반 중지: DB 볼륨 유지
docker compose --env-file .env.production -f compose.production.yaml down
```

이미지 태그 변경은 스키마를 되돌리지 않는다. 업데이트 전 DB를 백업하고 migration 호환성을 확인한다. `down --volumes`는 저장된 DB를 제거하므로 CI의 일회용 환경에서만 사용한다.

백업 예:

```bash
mkdir -p backups
umask 077
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres \
  pg_dump -U forge -d forge -Fc > backups/forge.dump
```

복구는 별도의 검증 DB에서 pg_restore로 먼저 확인한 뒤 해당 운영 환경의 절차에 따라 진행한다. 이 구성은 단일 호스트 배포 패키지이며 HA·자동 백업·외부 TLS·현장 데이터 이관은 배포 환경에서 구성한다.

## FORGE favicon

`frontend/public/favicon.svg`는 네이비 바탕과 코발트 적층 심볼의 원본이다. 16/32/48px ICO, 32px PNG, 180px Apple touch icon을 함께 제공한다. index.html의 상대 배포 경로는 Vite가 처리해 Docker의 루트 경로와 GitHub Pages의 /forge-ax/ 경로 모두에서 로드한다.

참조: [Docker Compose](https://docs.docker.com/compose/), [NGINX Docker 배포](https://docs.nginx.com/nginx/admin-guide/installing-nginx/installing-nginx-docker/).
