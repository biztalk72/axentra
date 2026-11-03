# 검증 기록

검증 날짜: 2026-11-03. 합성 제조 데이터 기준이며 실제 PLC·ERP·로봇에 연결하지 않았다.

| 항목 | 확인 상태 |
|---|---|
| TypeScript 검사·실제 API 연결 Vite 빌드 | 통과 |
| TypeScript 검사·Pages 체험 Vite 빌드 | 통과 |
| SQLite API 통합 테스트 | 14개 통과 · PostgreSQL 전용 2개 건너뜀 |
| Pages 브라우저 어댑터 업무 흐름 2개 테스트 | 통과 |
| Chrome 실제 API 로그인·대시보드 | 확인. KPI·설비 맵·인사이트 표시 |
| 반응형 UI | 데스크톱 및 390×844 모바일 확인. 모바일 상단 바 줄바꿈 개선 |
| Pages 시뮬레이션 UI | 버튼 실행 후 488 → 609 ea, +24.8%의 결정론적 결과 및 이력 표시 확인 |
| PostgreSQL 테스트·migration | 16개 통과, 동시 승인·로봇 배정 포함. 001_initial migration 적용 확인 |
| Docker Compose 빌드 및 통합 실행 | API·웹 이미지 빌드 성공. PostgreSQL/API healthy, Nginx 8088에서 로그인·overview 응답 확인 |
| GitHub Pages 공개 배포 | Actions 성공, 실제 배포 URL을 Chrome에서 열어 표시 확인 |

공개 체험: https://biztalk72.github.io/forge-ax/

CI: https://github.com/biztalk72/forge-ax/actions

최초 전체 파이프라인 성공: https://github.com/biztalk72/forge-ax/actions/runs/41562269261

로컬 Docker 콘솔: http://127.0.0.1:8088. 기존 서비스의 8080 사용을 피하도록 WEB_PORT를 구성했다.

## 자동 검증의 범위

백엔드는 인증 실패·만료·로그아웃, 서버 권한, source/event_id 중복·지연·유효성·배치 롤백, 임계값 이상 제안, 승인·반려·이중 처리, 시나리오·CSV, 학습·배포·추론·구버전 보관, 가상 AMR 배정·완료, 최종 공정 실적 집계, 라인 중복 시작 방지, 구성 저장·감사·metrics 권한을 검증한다.

PostgreSQL에서는 동시 승인과 동일 로봇의 동시 작업 배정도 검사한다. SQLite는 행 잠금 동작이 달라 해당 2개를 건너뛴다. CI는 두 DB 경로를 모두 실행한다.

Pages 체험 테스트는 브라우저 저장소 기반 데이터 수집 → 시나리오 → 합성 CSV → 모델 학습·배포·추론 → 승인 → 점검 작업 → 가상 로봇 → 감사 이력과 로그아웃·체험 로그인을 검증한다. 실제 서버 인증·권한·동시성 검증의 대체물이 아니다.

현재 의존성의 Starlette/httpx TestClient 사용은 deprecation warning을 출력할 수 있다. 테스트 실패는 아니며 패키지 전환 시 업데이트가 필요하다.

## 검증하지 않은 항목

현장 프로토콜·실설비 제어·실제 고장 예측 정확도·LLM/MCP·물리 엔진·로봇 학습·SSO·다사업장 격리·고부하 성능·생산 가용성·복구 목표는 구현 또는 검증 범위에 포함되지 않는다. 제안된 파일럿 목표를 측정 결과로 해석하지 않는다.
