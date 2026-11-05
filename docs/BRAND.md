# Axentra

**제조의 흐름을 연결하고, 실행을 지능화하다.**

**Connect manufacturing. Power intelligent execution.**

## 정체성과 표현

Axentra는 생산·물류·데이터와 현장의 실행을 공용 AI 에이전트로 연결하는 제조 운영 플랫폼이다. 표기는 `Axentra`, 저장소·폴더·배포 식별자는 `axentra`를 사용한다. 특정 업종 전용 제품으로 표현하지 않는다. 현재 체험 시나리오는 라면 제조이며, 실제 운영 성과나 고객 도입 실적을 주장하지 않는다.

- **Axentra Console**: 관리자·오퍼레이터의 제조 운영 워크스페이스.
- **Axentra Agents**: 기능별 에이전트, 카탈로그, 구성과 실행 관리.
- **Axentra Panel**: 라인별 TV·터치 화면, 위젯과 현장 패널 뷰.
- **Axentra Connect**: 데이터 제품·거버넌스와 MQTT·Kafka·MCP 연동 기반.
- **Axentra Vision**: CCTV·기기 카메라 모니터링 기능의 소개 명칭. 별도 영상 분석 제품이나 AI 비전 기능을 의미하지 않는다.

브랜드 심볼은 공정 흐름을 나타내는 A와 세 연결 노드다. 네이비 `#101c2d`, 코발트 `#376cf5`, 밝은 회청색 배경을 사용한다. SVG 원본은 `frontend/public/favicon.svg`, React 심볼은 `frontend/src/brand-mark.tsx`에 있다. PNG·ICO·Apple icon은 `uv run --with pillow scripts/generate-icons.py`로 다시 생성한다.

## 소개 사이트와 체험

- 소개: https://axentra-5u6.pages.dev/
- English: https://axentra-5u6.pages.dev/?lang=en
- 데모: https://axentra-5u6.pages.dev/demo
- 저장소: https://github.com/biztalk72/axentra
- GitHub Pages 미러: https://biztalk72.github.io/axentra/
- 로컬 프로젝트 폴더: `/Users/brian-work/Works/axentra`

소개 사이트는 로그인 없이 플랫폼·운영 흐름·활용 영역·문서를 제공한다. Console/Agents/Panel/Connect 탭은 키보드 좌우·Home·End를 지원한다. 데모 버튼은 선택 언어를 유지한다. 기존 `#overview`, `#panel-view`, `#panel/...` 즐겨찾기는 데모 페이지로 이동한다. `/forge-ax/`의 이전 Pages 주소는 저장소 이름 변경 후 유지가 보장되지 않으므로 새 주소를 사용한다.

## 기존 데이터와 연동 호환성

같은 origin에서 브라우저 저장 키 `forge-ax-*`, 로그인 `forge-token`, 패널 키 `forge-panel-*`를 최초 사용 시 `axentra-*`로 복사·이관한다. 신규 키가 이미 있으면 신규 값을 우선하며, 복사 성공 후 이전 키를 제거한다. 로그아웃 후 구 세션이 복구되지 않는다. 저장된 사용자 계정·해시·패널 구성·원장은 그대로 보존한다. 바뀌지 않은 기본 사업장 이름만 변경하고 고객이 작성한 이름은 유지한다.

새 API·로그·CSV·Prometheus 지표·이벤트 namespace는 Axentra를 사용한다. 지표는 `axentra_http_requests_total`, `axentra_http_request_seconds`, 새 이벤트 type은 `axentra.*.v1`, source는 `urn:axentra:plant:default`, 기본 topic은 `axentra.factory.events.v1`이다. 기존 outbox의 이벤트와 저장된 브로커 topic은 이력을 보존하기 위해 다시 쓰지 않는다. 기존 소비자는 구·신 namespace를 함께 처리하도록 조정하고, topic은 관리자 설정에서 전환한다.

MCP 환경변수는 `AXENTRA_API_URL`, `AXENTRA_API_TOKEN`이다. 실행 환경의 기존 변수명을 함께 변경해야 한다. 관리자 로그인은 `admin@admin.com`과 기존 비공개 암호를 유지한다. 이전·현재 내부 관리자 별칭은 회원가입에서 예약한다.

기존 Docker·SQLite 이관 절차는 [배포 가이드](DEPLOYMENT.md)를 따른다. 사용자 자격증명·DB 덤프·환경 파일·참조용 UI-sample 자료는 공개 저장소에 포함하지 않는다.
