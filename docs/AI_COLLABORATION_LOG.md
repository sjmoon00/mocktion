# AI 협업 로그 (AI Collaboration Log)

> 이 프로젝트의 목표 중 하나는 "무엇을 만들었는가"뿐 아니라 "Claude Code와 어떻게 협업해서 만들었는가"를 그 자체로 기록하는 것이다.
> [DECISIONS.md](DECISIONS.md), [TRADEOFFS.md](TRADEOFFS.md)가 "결과에 대한 근거"라면, 이 문서는 **시간순 과정** — 무엇을 물었고, AI가 무엇을 하고 무엇을 놓쳤고, 사람이 어디서 판단을 개입시켰는지 — 를 담는다.
> 세션(대화 단위)마다 항목을 추가한다. 완료된 항목을 지우거나 다시 쓰지 않는다 — 기록이므로 누적한다.

---

## 세션 1 — 2026-07-09: Phase 0 계획 확정 및 실 DB 검증

**시작 상태**: `notion-mockserver-spec.md`(기획서)와 `IMPLEMENTATION_PLAN.md`(Claude Code가 기획서를 검토해 만든 세부 구현 계획)만 존재. 코드 없음.

**진행 과정**:

1. "Phase 0 구현 계획을 먼저 확정해봐"라는 요청에, AI가 계획서 체크리스트 항목을 실행 가능한 수준까지 구체화 — 모듈 시스템(CJS vs ESM), tsconfig 세부값, package.json 필드 등. 이 과정에서 AI가 `npm view @notionhq/client`로 패키지 메타데이터를 직접 조회해 "계획서에 NodeNext라고만 적혀 있던 것"을 "CJS 기반 NodeNext"로 구체적인 결정으로 확정함 ([D-005](DECISIONS.md#d-005-commonjs--moduleresolution-nodenext-esm-미채택)).
2. Phase 0의 나머지 항목(실 DB 연결 검증)은 AI가 임의로 진행할 수 없는 지점이었다 — 실제 `NOTION_TOKEN`과 대상 Notion DB URL이 필요했다. AI가 이 지점에서 멈추고 사용자에게 준비 방법을 질의함 (AskUserQuestion). **사람이 개입한 지점**: 토큰을 대화창에 직접 붙여넣지 않고 `.env` 파일에 직접 기록한 뒤 알려주는 방식을 선택 — 민감정보를 대화 로그에 남기지 않기 위한 사용자의 판단.
3. 사용자가 `.env` 준비를 알리자, AI가 임시 탐색 스크립트(`_phase0-explore.ts`, 이후 삭제)로 실제 Notion DB(대회/팀 관리 서비스, 페이지 120개)에 연결해:
   - `databases.retrieve` → `data_sources` 배열 확인
   - 전체 페이지 페이지네이션 순회 (100개 제한 실제로 발동 — 120개 중 20개는 페이지네이션 없이는 누락됐을 것)
   - 스펙 문서가 이미 검증했다고 언급한 실제 4개 예시 페이지(GET 제출물 상세조회 / POST 팀원 등록 / PUT 정렬 저장 / DELETE 카테고리 삭제)를 정확히 찾아내 fixture로 저장
4. **AI가 실측으로 잡아낸 것 — 스펙 문서의 가정과 실제 데이터가 다른 3가지**:
   - `HTTP Method`/`응답코드`가 스펙 가정(Select)과 달리 실제로는 `multi_select`
   - `URI`가 스펙 가정(Title)과 달리 `rich_text`이고, 진짜 Title 프로퍼티는 `기능명`(한글 설명)
   - "예외 상황" 텍스트가 스펙 가정(`paragraph`)과 달리 실제로는 `bulleted_list_item` 블록
   
   이 세 가지는 스펙 문서를 아무리 정독해도 코드로 옮기기 전엔 드러나지 않는 것들이었다. Phase 1(파싱 모듈 구현)에 들어가기 전에 Phase 0에서 실 DB로 먼저 검증하는 단계를 계획에 넣어둔 것 자체가, 발견을 앞당긴 핵심 지점이다.
5. 발견 직후 AI가 `IMPLEMENTATION_PLAN.md`의 Phase 1 체크리스트 문구 자체를 실제 스키마 기준으로 다시 썼다 (예: "Method(select) 추출" → "Method는 multi_select 배열의 첫 값 사용, 0개면 스킵+경고, 2개 이상이면 경고 후 첫 값"). 발견을 별도 메모로만 남기지 않고 실행 체크리스트에 직접 반영해, 나중에 계획과 실제 구현이 따로 노는 것을 방지.

**포트폴리오 관점에서의 핵심 포인트**:
- AI에게 "스펙대로 구현해"라고 맡기지 않고, "실 데이터로 가정을 먼저 검증하는 단계"를 Phase 0으로 설계에 넣은 것 — 이건 AI가 아니라 사람의 판단이었다.
- AI가 실제로 스키마 불일치 3건을 찾아냈지만, 그걸 그대로 밀어붙이지 않고 계획 문서에 근거와 함께 기록하도록 지시한 것도 사람의 개입.
- 토큰 등 민감정보를 AI와의 대화창에 노출하지 않는 방식(.env 직접 작성)을 사용자가 스스로 선택.

---

## 세션 2 — 2026-07-09: Phase 1 파싱 모듈 구현

**시작 상태**: Phase 0 완료 — `notionClient.ts`, 실 DB 검증 결과, fixture 4개(`get-200-submission-detail`, `post-201-team-member`, `put-204-sort`, `delete-204-category`) 확보됨.

**진행 과정**:

1. "Phase 1 구현 시작해줘"라는 짧은 요청에, AI가 바로 코드를 쓰지 않고 `IMPLEMENTATION_PLAN.md`/`DECISIONS.md`/`notion-mockserver-spec.md`와 fixture 4개 전체를 먼저 읽어 계획의 세부 규칙(3단계 우선순위, 에러 테이블 파싱 규칙, `__children` 필드로 미리 펼쳐진 fixture 구조)을 파악한 뒤 설계에 들어감.
2. 구현 전 `@notionhq/client`(v5.23.0) 타입 선언을 직접 뒤져 계획서가 몰랐던 공식 헬퍼 3가지를 발견: `extractDatabaseId`(URL→ID 추출), `isFullPage`/`isFullBlock`(partial 응답 타입 좁히기), `collectPaginatedAPI`(페이지네이션 제네릭 헬퍼). 계획서의 "자체 정규식으로 32hex 추출" 항목을 SDK 헬퍼 재사용으로 대체함([D-009](DECISIONS.md#d-009-db-url--database_id-추출은-자체-정규식-대신-sdk의-extractdatabaseid-헬퍼를-래핑)).
3. `collectPaginatedAPI`를 실제로 적용했다가 `npm run build`(strict TS)에서 타입 에러 발견 — SDK 자체의 `start_cursor: string | null | undefined` 타입이 헬퍼의 제네릭 제약(`string | undefined`)과 불일치. 제네릭 타입 인자를 억지로 맞추는 대신 계획서 원안인 수동 `has_more` 루프로 되돌림([D-011](DECISIONS.md#d-011-notion-페이지네이션은-sdk의-collectpaginatedapi-대신-수동-has_morenext_cursor-루프)) — "타입 에러를 우회하기보다 더 단순한 대안으로 교체"한 판단.
4. `--status` 필터는 계획서의 "select/status 타입 감지 후 서버사이드 필터 분기" 대신, 전량 조회 후 클라이언트 사이드에서 값을 비교하는 방식으로 단순화([D-010](DECISIONS.md#d-010---status-필터는-서버사이드-selectstatus-분기-대신-전량-조회-후-클라이언트-사이드-필터링)) — Phase 0에서 이미 페이지 수(120개)와 상태 타입(`status` 고정)이 확인되어 서버사이드 분기의 이득이 크지 않다고 판단. **사람이 사후 검토해야 할 지점**: 이 단순화는 AI가 자체 판단(Auto Mode)으로 진행한 것이라, 사용자가 이 트레이드오프에 동의하는지 확인이 필요하다.
5. 6개 모듈(`richText`, `databaseFetcher`, `propertyExtractor`, `blockParser`, `responseJsonExtractor`, `errorCaseParser`) + 4개 테스트 파일을 구현. fixture의 `__children` 필드명을 그대로 내부 타입(`BlockWithChildren`)에 사용해, 실 데이터 구조와 파서 타입이 그대로 맞물리도록 설계.
6. `npm test`(18개 테스트, GET/POST/PUT/DELETE 4개 fixture 기반) + `npm run build`(strict TS) 모두 통과 확인.

**포트폴리오 관점에서의 핵심 포인트**:
- "계획서에 없던 공식 SDK 헬퍼를 찾아 재사용"과 "그 헬퍼가 실제로는 타입이 안 맞아 되돌림" 둘 다 같은 세션에서 일어남 — AI가 라이브러리를 맹신하지 않고 컴파일러 피드백으로 재검증한 사례.
- 계획서의 서버사이드 필터 분기 로직을 통째로 단순화한 결정(D-010)은 사람의 사전 승인 없이 Auto Mode 하에서 AI가 내린 판단이므로, 다음 세션에서 사용자 검토가 필요.
