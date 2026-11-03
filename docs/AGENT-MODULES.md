# 기능별 에이전트 개발·구성·수정

멀티 AI 에이전트 → **기능별 에이전트**에서 기능 모듈을 관리한다. 기본 13개 에이전트와 사용자 정의 구성을 합쳐 최대 32개를 등록한다. 구성 변경은 관리자, 실행은 운영자 이상, 목록·미리보기는 조회자 이상에게 허용한다.

| 모듈 ID | 기능 | 기본 선행 모듈 | 개별 매개변수 |
|---|---|---|---|
| data | 공통 데이터·이벤트 범위 | 없음 | 없음 |
| equipment | 설비 점검 대상 | data | 온도·진동 기준 |
| production | 작업지시·병목 용량 | data | 없음 |
| quality | 누적 품질 | data | 목표 양품률 |
| logistics | 공용 AMR·현장 요청 | data | 없음 |
| edge | 커넥터 구성·수집 | data | 없음 |
| twin | 2D 설비 맵 상태 | data | 없음 |
| simulation | 용량 가정 비교 | production | 분석 시간·주기 단축률 |
| models | 통계 모델 학습·배포 상태 | data | 없음 |
| robots | 가상 로봇 상태 | logistics | 최소 배터리 |
| physical | 실험·합성 데이터셋 | simulation | 없음 |
| panels | 패널 게시·변경 초안 | data | 없음 |
| cctv | 카메라 소스 설정 | panels | 없음 |

에이전트는 해당 기능의 데이터 진단·계산을 수행한다. 학습·배포·게시·로봇 배정 등 기존 업무 API의 변경 작업은 해당 업무 화면과 권한·승인 계약을 따른다. CCTV 모듈은 영상 내용을 분석하지 않는다.

## 화면에서 구성

에이전트를 선택해 이름·역할 설명·사용 여부·선행 의존성·진단 매개변수·LLM 요약 지침을 수정한다. 지침은 Ollama 모드에서만 적용한다. **변경 미리보기**는 A/B 라인의 도구 결과를 읽으며 구성 저장·LLM 호출·작업 생성을 하지 않는다.

**구성 저장**은 expected_revision으로 충돌을 검사하며 새 리비전과 감사 기록을 만든다. 최근 20개 이전 구성을 보관한다. **편집에 복원** 후 저장하면 과거 구성을 새 리비전으로 복원한다. 사용 중지는 기존 실행의 결과나 이력을 삭제하지 않는다.

**에이전트 구성 추가**는 등록된 기반 기능을 선택해 독립 ID·이름을 만든다. 새 구성은 중지 상태로 시작한다. 기준값과 지침·의존성을 수정한 뒤 활성화한다. 코드 구현은 공유하지만 구성은 서로 독립적이다. ID와 기반 도구는 생성 후 바꾸지 않는다.

**개별 실행** 또는 워크스페이스의 기능 선택으로 필요한 모듈을 실행한다. Planner가 공통 data와 선행 의존성을 자동 포함하고 위상 순서로 DAG를 구성한다. 순환 의존성, 없는/중지된 선행 모듈, 중복 선택을 거부한다. 기본 실행은 사용 중인 전체 모듈이다. Main과 승인 게이트를 포함한 기본 노드는 16개다.

실행 생성 시 데이터와 모듈 ID·코드 버전·구성 리비전·매개변수·지침을 고정한다. 편집이 기존 실행에 섞이지 않는다. 일시중지/재개도 생성 당시 구성을 사용한다. 실행 노드와 응답의 modules에서 적용 리비전을 확인한다. 코드 버전이 달라진 이전 실행은 자동 대체하지 않고 실패로 남기므로 새 진단을 시작한다.

## 독립 개발 경계

```text
backend/app/agent_modules/
  catalog.json       기능·매개변수·기본 의존성 계약 (기준 파일)
  contracts.py       JSON 입력/결과 계약
  equipment.py      설비 에이전트 구현
  quality.py        품질 에이전트 구현
  ...               기능별 독립 Python 파일
  __init__.py       명시적 도구 등록·코드 버전/결과 검사
backend/app/agent_registry.py  구성·리비전·DAG 검증 API
backend/app/agents.py          공통 스냅샷·스케줄러·승인 흐름
frontend/src/agent-modules/
  contracts.ts      공통 타입
  registry.ts       Pages 구성·의존성 검증
  context.ts        비밀 정보를 제외한 공통 스냅샷
  equipment.ts      Pages 설비 에이전트
  ...               기능별 독립 TypeScript 파일
  index.ts          명시적 실행 등록
frontend/src/agent-modules-page.tsx  공통 구성 스튜디오
```

백엔드와 Pages의 기능 도구는 개별 파일로 수정한다. 공통 오케스트레이터를 수정하지 않고 등록된 도구를 호출한다. 각 도구에는 데이터·매개변수·완료된 선행 결과의 복사본을 전달하므로 다른 워커의 입력을 변경할 수 없다.

Python 모듈의 인터페이스:

```python
from .contracts import fact

def run(source, parameters, blackboard):
    assets = source['assets']
    return fact('설비 범위를 확인했습니다.',
                {'assets': len(assets)},
                [asset['id'] for asset in assets],
                ['생성 시점의 라인 스냅샷 기준'])
```

결과는 summary, metrics, evidence, findings의 JSON 계약이다. 점검 도구는 maintenance_assets를 추가할 수 있으며 Main이 대상 ID를 합쳐 기존 관리자 승인 절차에 연결한다. 각 에이전트에서 직접 DB·네트워크·장비를 변경하지 않는다. 선택적 LLM 호출은 공통 제공자 어댑터가 처리한다.

새 기능을 개발할 때:

1. catalog.json에 고유 ID·도구·코드 버전·설명·의존성·매개변수 범위를 정의한다.
2. 독립 Python run 함수와 Pages TypeScript AgentHandler를 구현하고 각각 __init__.py와 index.ts의 명시적 등록표에 연결한다.
3. `python3 scripts/sync-agent-catalog.py`로 Pages 카탈로그를 갱신한다. 공통 편집기와 DAG는 카탈로그를 읽으므로 추가 분기 없이 표시한다.
4. 계약·매개변수·의존성·라인 범위·결과 테스트를 추가한다. 입출력 스키마 변경은 저장된 구성의 migration을 함께 제공한다. 코드 의미가 바뀌면 해당 도구의 버전을 올린다.
5. Python/Pages 테스트와 두 빌드를 실행한 뒤 릴리스한다.

현재는 동일 API 프로세스의 독립 코드 모듈이다. 에이전트별 별도 컨테이너·분산 큐는 제공하지 않는다. Pages 설정과 실행은 해당 브라우저 저장소에 보관된다.
