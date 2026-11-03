# FORGE AX

**데이터에서 실행까지, 제조 전주기를 하나로 연결하는 AX 플랫폼 MVP.**

[공개 체험 사이트](https://biztalk72.github.io/forge-ax/) · [PRD](docs/PRD.md) · [아키텍처](docs/ARCHITECTURE.md) · [API](docs/API.md) · [검증 기록](docs/VERIFICATION.md) · [가입·계정 가이드](docs/ACCOUNTS.md) · [현장 패널](docs/FIELD-PANELS.md) · [CCTV](docs/CCTV.md) · [멀티 에이전트](docs/MULTI-AGENT.md)

모던 한국어 콘솔과 기업형 백엔드를 함께 제공합니다. OCTOPUS의 공개된 8개 기능 영역을 참고한 독립 구현이며, UVC 제품이나 제휴 서비스가 아닙니다.

## 구현 범위

- **Edge**: REST 배치 수집, 검증, 중복 제거, 가상 게이트웨이, 커넥터 설정.
- **Data Hub**: 설비별 이벤트 탐색과 CSV export.
- **Twin**: 8개 설비의 선택 가능한 디지털 맵과 현재 운전 상태.
- **Simulator**: 병목 주기 기반 What-if 비교와 실험 이력.
- **AI Hub**: Gaussian z-score 학습, 버전·배포, 현재 데이터 추론.
- **Agentic Operations**: ARTEX 구조를 참고한 Planner·5개 전문 워커·Main·승인 게이트, 실행/자산 그래프, 공유 사실·도구 기록·보고서, 중지·재개·취소. 기본 도구 분석 및 선택적 Ollama 요약 연계.
- **Robot Hub**: 가상 AMR 작업 배정, 완료, 위치·배터리 갱신.
- **Physical AI Lab**: 시나리오 파라미터 기반 합성 표 데이터 생성.
- **현장 패널**: 라인별 TV·터치 화면 8종, 순환·테마·해상도, 미리보기, 초안/게시 분리, 일괄 배분·게시, 장치 키·하트비트·현장 입력.
- **CCTV**: HLS/MP4/MJPEG와 모의 화면, 단일/멀티뷰·최소화·최대화, 카메라 설정, 대시보드·패널 위젯.
- **MES / 관리**: 생산 작업지시, 최종 공정 실적, RBAC, 감사로그.

실장비 드라이버, 3D/물리 엔진, MCP·자율 도구 계획, 로봇 정책 학습, SSO와 다사업장은 후속 범위입니다. MVP의 통계 이상감지는 고장 예측 성능을 의미하지 않습니다. 실제 CCTV 주소와 LLM 서비스는 제공되지 않았으며 연결 설정이 필요합니다.

## GitHub Pages에서 확인

**https://biztalk72.github.io/forge-ax/**

로그인 화면의 **체험 계정 만들기**에서 직접 가입할 수 있습니다. 가입 직후 일반 사용자(체험 운영자)로 입장하며, 로그아웃 후 같은 계정으로 재로그인합니다. 관리자 이메일은 `admin@admin.com`이며 지정한 관리자 암호로 로그인합니다.

Pages의 계정·제조 데이터는 각 브라우저의 localStorage에 저장됩니다. 다른 기기와 공유되지 않고 실제 서버·공장에 연결되지 않습니다. 사이트 데이터를 지우면 그 브라우저의 체험 계정도 삭제됩니다. 실제 서버의 계정은 PostgreSQL에 저장됩니다. [가입·계정 가이드](docs/ACCOUNTS.md)를 확인하세요.

일반 사용자 체험: 직접 가입 → 대시보드 → 시뮬레이션 → AI 모델 학습 → 가상 로봇 작업 → 합성 데이터·CSV. 현장 패널 스튜디오에서 화면을 구성·미리보기하고, 멀티 AI 에이전트에서 라인 진단을 실행할 수 있습니다. 모델 배포·패널 게시·설치 키·제안 승인·사용자 목록·감사로그는 관리자 계정으로 확인합니다.

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

Nginx → FastAPI → PostgreSQL로 동작하며 시작 시 Alembic migration을 적용합니다. 관리자 계정은 ADMIN_EMAIL / ADMIN_PASSWORD 변경 시 갱신하고 기존 관리자 세션을 폐기합니다. 제조 데이터와 다른 사용자 계정은 유지합니다. ALLOW_REGISTRATION=true일 때 일반 사용자가 직접 가입할 수 있습니다.

## 빠른 로컬 개발 — SQLite

필수: Node.js 24+, Python 3.12+, [uv](https://docs.astral.sh/uv/).

```bash
./scripts/dev.sh
```

콘솔 http://127.0.0.1:5173 · API http://127.0.0.1:8000/docs

개별 실행:

```bash
cp .env.example .env
# .env에서 실제 서버 관리자 이메일·암호 설정
uv sync --directory backend --frozen
npm --prefix frontend ci
# 터미널 1
cd backend
.venv/bin/uvicorn app.main:app --env-file ../.env --host 127.0.0.1 --port 8000
# 터미널 2, 저장소 루트에서
npm --prefix frontend run dev
```

관리자: `admin@admin.com` / 실제 서버 암호는 `.env`의 `ADMIN_PASSWORD` 값입니다. 공유 일반 계정을 자동 생성하지 않으며 **체험 계정 만들기**로 직접 가입합니다. 신규 계정은 operator 권한으로 고정되고, 관리자 작업은 서버에서도 거부합니다. 가상 스트림은 기본 8초 주기이며 `DEMO_STREAM=false`로 중지합니다.

`DEMO_MODE=false`는 가상 기능과 seed를 끕니다. migration과 유효한 ADMIN_PASSWORD가 필요합니다. 설비/사업장 관리와 실수집 어댑터는 현장 연동 작업이므로 이 설정만으로 운영 배포가 완성되지는 않습니다.

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
backend/app/         가입·세션·권한, DB, API, 업무 서비스, demo seed
backend/migrations/ 명시적 Alembic migration
backend/tests/      API 통합 테스트
frontend/tests/     공개 체험 업무 흐름 테스트
docs/               PRD, 아키텍처, API, 검증 기록
infra/              선택 MQTT 설정
.github/workflows/  테스트·빌드·Pages 배포
```

이 MVP는 단일 사업장 가상 라인 검증용입니다. 생산 도입 요구사항과 확장 로드맵은 [PRD](docs/PRD.md)를 확인하세요.
