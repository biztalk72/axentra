# FORGE AX

**데이터에서 실행까지, 제조 전주기를 하나로 연결하는 AX 플랫폼 MVP.**

[공개 체험 사이트](https://biztalk72.github.io/forge-ax/) · [PRD](docs/PRD.md) · [아키텍처](docs/ARCHITECTURE.md) · [API](docs/API.md) · [검증 기록](docs/VERIFICATION.md)

모던 한국어 콘솔과 기업형 백엔드를 함께 제공합니다. OCTOPUS의 공개된 8개 기능 영역을 참고한 독립 구현이며, UVC 제품이나 제휴 서비스가 아닙니다.

## 구현 범위

- **Edge**: REST 배치 수집, 검증, 중복 제거, 가상 게이트웨이, 커넥터 설정.
- **Data Hub**: 설비별 이벤트 탐색과 CSV export.
- **Twin**: 8개 설비의 선택 가능한 디지털 맵과 현재 운전 상태.
- **Simulator**: 병목 주기 기반 What-if 비교와 실험 이력.
- **AI Hub**: Gaussian z-score 학습, 버전·배포, 현재 데이터 추론.
- **Agentic Operations**: 임계값 기반 제안, 관리자 승인·반려, 점검 작업 생성.
- **Robot Hub**: 가상 AMR 작업 배정, 완료, 위치·배터리 갱신.
- **Physical AI Lab**: 시나리오 파라미터 기반 합성 표 데이터 생성.
- **MES / 관리**: 생산 작업지시, 최종 공정 실적, RBAC, 감사로그.

실장비 드라이버, 3D/물리 엔진, LLM/MCP, 로봇 정책 학습, SSO와 다사업장은 후속 범위입니다. MVP의 통계 이상감지는 고장 예측 성능을 의미하지 않습니다.

## GitHub Pages에서 확인

**https://biztalk72.github.io/forge-ax/**

로그인 없이 공개 체험 역할로 시작합니다. 데이터는 각 방문자 브라우저의 localStorage에 저장되며 실제 서버·공장과 연결되지 않습니다. 사이트 데이터를 초기화하면 원래 가상 상태로 돌아갑니다. 로그아웃한 경우 화면의 데모 계정 입력 버튼으로 다시 로그인할 수 있습니다.

권장 순서: 대시보드 → 시뮬레이터 실행 → AI 모델 학습·배포·추론 → 에이전트 제안 승인 → 로봇 가상 작업 배정·완료 → 합성 데이터 생성·CSV → 감사로그.

## 기업형 MVP 실행 — Docker

필수: Docker Engine + Compose.

```bash
cp .env.example .env
# .env의 비밀번호를 원하는 값으로 변경
# URL에 포함되는 POSTGRES_PASSWORD는 영문·숫자 조합 권장
docker compose up --build -d
```

- 콘솔: http://127.0.0.1:8088
- API 문서: http://127.0.0.1:8088/docs
- 상태: `docker compose ps`
- 로그: `docker compose logs -f api`
- 중지: `docker compose down` (DB 볼륨 보존)
- 선택 인프라: `docker compose --profile integration up -d` (Redis·MQTT는 현재 앱과 미연결)

Nginx → FastAPI → PostgreSQL로 동작하며 시작 시 Alembic migration을 적용합니다. 최초 실행에만 사용자를 생성하므로 ADMIN_PASSWORD를 바꿔 재시작해도 기존 사용자 비밀번호는 바뀌지 않습니다.

## 빠른 로컬 개발 — SQLite

필수: Node.js 24+, Python 3.12+, [uv](https://docs.astral.sh/uv/).

```bash
./scripts/dev.sh
```

콘솔 http://127.0.0.1:5173 · API http://127.0.0.1:8000/docs

개별 실행:

```bash
uv sync --directory backend --frozen
npm --prefix frontend ci
# 터미널 1
cd backend
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
# 터미널 2, 저장소 루트에서
npm --prefix frontend run dev
```

데모 계정: `admin@forge.local`, `operator@forge.local`, `viewer@forge.local` / 기본 비밀번호 `ForgeDemo!2026`. `ADMIN_PASSWORD`로 최초 bootstrap 비밀번호 변경 가능. 가상 스트림은 기본 8초 주기이며 `DEMO_STREAM=false`로 중지합니다.

`DEMO_MODE=false`는 가상 기능과 seed를 끕니다. migration과 12자 이상 ADMIN_PASSWORD가 필요합니다. 설비/사업장 관리와 실수집 어댑터는 현장 연동 작업이므로 이 설정만으로 운영 배포가 완성되지는 않습니다.

## 검증과 빌드

```bash
cd backend && .venv/bin/python -m pytest -q
cd ../frontend
npm test
npm run build          # 실제 API 연결 빌드
npm run build:pages    # 브라우저 체험 전용 빌드
```

서버 연결 빌드는 API 장애 시 체험 모드로 바뀌지 않습니다. PostgreSQL 검증은 격리된 테스트 DB를 지정해 수행합니다.

```bash
# 반드시 삭제 가능한 테스트 전용 DB 사용: 테스트 fixture가 테이블을 재생성합니다.
TEST_DATABASE_URL=postgresql+psycopg://forge:password@localhost:5432/forge_test \
  .venv/bin/python -m pytest -q
```

`main` push → SQLite/PostgreSQL 통합 테스트 → 체험 동작 테스트 → TypeScript/Vite 빌드 → GitHub Pages 배포. 기능 변경은 같은 파이프라인으로 다시 배포됩니다.

## 디렉터리

```text
frontend/src/        React 콘솔, Pages 브라우저 어댑터, 공통 스타일
backend/app/         인증, DB, API, 업무 서비스, demo seed
backend/migrations/ 명시적 Alembic migration
backend/tests/      API 통합 테스트
frontend/tests/     공개 체험 업무 흐름 테스트
docs/               PRD, 아키텍처, API, 검증 기록
infra/              선택 MQTT 설정
.github/workflows/  테스트·빌드·Pages 배포
```

이 MVP는 단일 사업장 가상 라인 검증용입니다. 생산 도입 요구사항과 확장 로드맵은 [PRD](docs/PRD.md)를 확인하세요.
