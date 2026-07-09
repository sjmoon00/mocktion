# Notion Mock Server CLI — 구현 계획 및 진행 추적

> 이 문서는 [notion-mockserver-spec.md](../notion-mockserver-spec.md)를 기반으로 한 세부 구현 계획이다.
> 각 항목의 체크박스로 구현 진행 상황을 추적한다. 구현이 완료된 항목은 `[x]`로 표시할 것.

## Context

Notion API 명세 DB URL을 입력하면 로컬 목서버를 즉시 실행하는 CLI 도구 (TypeScript + Commander + Express + `@notionhq/client`). 스펙 문서만 있는 상태에서 처음부터 구현한다.

확정된 스코프 결정:
- **테스트**: 파서 모듈만 fixture 기반 vitest 단위 테스트 (목서버는 수동 검증)
- **실 데이터**: 실제 Notion 명세 DB와 NOTION_TOKEN 준비됨 → Phase 0부터 실 DB로 검증

**관련 문서** (이 프로젝트는 AI와의 협업 과정 자체가 포트폴리오 목표라 별도로 관리):
- [DECISIONS.md](DECISIONS.md) — 기술적 의사결정 로그, "왜 이걸 선택했는가"
- [TRADEOFFS.md](TRADEOFFS.md) — 스코프 트레이드오프, "왜 이건 하지 않았는가"
- [AI_COLLABORATION_LOG.md](AI_COLLABORATION_LOG.md) — 세션별 AI 협업 과정 시간순 기록

---

## 기존 계획서 검토 — 보완 사항

계획서는 전반적으로 잘 설계되어 있다 (heading/language 태그를 신뢰하지 않는 파서 설계, 204 우선 처리, Data Source 구조 대응). 다음은 계획서에 빠져 있어 구현 시 반드시 추가해야 할 사항이다.

### 반드시 보완 (실사용에 직접 영향)

1. **CORS 미들웨어 누락** — 주 사용자가 브라우저(localhost:3000 등)에서 fetch를 호출하는 프론트엔드 개발자인데, 계획서에 CORS 처리가 전혀 없다. CORS 없이는 이 도구의 핵심 시나리오가 동작하지 않는다. `cors` 패키지를 추가하고 전체 허용(`app.use(cors())`)으로 등록한다.

2. **`상태` 프로퍼티가 Notion `status` 타입일 가능성 → Phase 0에서 실 DB로 확인, 실제로 `status` 타입임.** 계획서 6.1절의 필터 `{ property: '상태', select: { equals } }`는 select 타입 전제라 그대로 쓰면 API 에러. 해결: `databases.retrieve` 응답(어차피 data_source_id 조회를 위해 호출함)에서 프로퍼티 타입을 확인해 `select`/`status` 필터를 분기하고, 그 외 타입이면 클라이언트 사이드 필터링으로 폴백.

3. **`HTTP/1.1 200 OK`로 시작하는 응답 블록에서 본문 추출 로직 미정의** — 계획서 3.3절은 "그 JSON을 그대로 사용"이라고만 했는데, 이 블록에는 상태줄(+헤더)이 포함돼 있다. 첫 `{` 또는 `[`가 나오는 위치부터 끝까지를 본문으로 추출해야 한다. 본문 없는 `HTTP/1.1 204 No Content` 단독 블록은 "본문 없음"으로 처리.

4. **블록 children 페이지네이션 누락** — 계획서는 DB 쿼리 페이지네이션(6.3절)만 언급. `blocks.children.list`도 100개 초과 시 `has_more`/`next_cursor` 반복이 필요하다 (긴 명세 페이지에서 code 블록이 뒤쪽에 있으면 누락됨).

5. **rich_text 조각 병합** — Notion은 하나의 code 블록/title/cell 텍스트를 여러 rich_text 세그먼트로 쪼갤 수 있다 (특히 긴 JSON, 부분 bold). 모든 텍스트 추출은 `rich_text.map(t => t.plain_text).join('')` 공용 유틸로 처리.

### 견고성 보완 (에지 케이스)

6. **응답 후보 code 블록이 여러 개일 때** — 계획서에 규칙 없음. 첫 번째 후보를 사용하고 콘솔 경고. 또한 요청 본문 JSON이 별도 `{...}` 블록으로 분리된 페이지는 응답으로 오분류될 수 있음 — 알려진 한계로 README에 명시 (헤딩을 신뢰하지 않기로 한 설계의 트레이드오프).

7. **응답 JSON 유효성 검증** — 추출한 텍스트를 `JSON.parse`로 검증. 실패해도 원문 그대로 서빙(명세 그대로 원칙)하되 기동 시 `⚠️ 유효하지 않은 JSON` 경고 출력.

8. **에러 테이블 응답코드 셀 파싱** — `404`뿐 아니라 `404 Not Found` 같은 텍스트 대비, 선행 정수만 추출. 정수가 없으면 해당 행 스킵 + 경고. 테이블 헤더는 `table.has_column_header` 플래그를 우선 확인하고, 없으면 첫 행을 헤더로 간주. **→ Phase 0 실 데이터에서 `"409 Conflict"`, `"403 "`(trailing space) 형태 실제 확인됨 — 선행 정수 추출과 trim이 실제로 필요.**

9. **DB URL → database_id 추출** — `https://www.notion.so/{workspace}/{제목}-{32hex}?v={view}` 형태에서 마지막 32자리 hex를 추출 (하이픈 포함/미포함, 쿼리스트링 제거 모두 처리). 추출 실패 시 명확한 에러 메시지.

10. **429 재시도 + 동시성 제한** — Notion rate limit(평균 3req/s) 대응. 429 시 `Retry-After` 헤더만큼 대기 후 재시도(최대 3회). 페이지별 파싱은 순차 처리(페이지 수십 개 수준이라 병렬화 불필요 — 단순함 우선).

11. **404 폴백 핸들러** — 미등록 경로 요청 시 등록된 엔드포인트 목록 힌트를 포함한 JSON 404 응답 (프론트 개발자가 오타를 즉시 알 수 있도록).

### 계획서 확인 결과 그대로 진행해도 되는 부분

- **SDK**: `@notionhq/client` v5.x가 2025-09-03 버전과 `notion.dataSources.query()`를 정식 지원한다 (계획서의 `notion.request()` raw 호출 불필요 — 전용 메서드 사용). `databases.retrieve` 응답의 `data_sources` 배열도 정식 타입. Phase 0에서 실 DB로 즉시 확인.
- **Express 4 고정**: 계획서대로 `express@^4` + `@types/express@^4`. `{var}` → `:var` 변환은 path-to-regexp v0.x(Express 4)에서 안정적. Express 5 전환은 이득 없음.
- **Request 섹션 미파싱, AI mock 생성 제외, 단일 데이터소스만 지원** — 합리적 스코프 결정, 유지.

---

## 프로젝트 구조

계획서 8절 구조를 따르되, 테스트와 공용 유틸 추가:

```
notion-mockserver/
├── src/
│   ├── index.ts                     # CLI 진입점 (Commander + 전체 흐름 조립)
│   ├── notion/
│   │   ├── notionClient.ts          # Client 초기화 + NOTION_TOKEN 검증
│   │   ├── databaseFetcher.ts       # URL→ID 추출, data_source 조회, 페이지네이션, 상태 필터(select/status 분기)
│   │   ├── pageParser.ts            # 페이지 → EndpointSpec 오케스트레이터
│   │   ├── propertyExtractor.ts     # Method/응답코드(multi_select 첫 값)·URI(rich_text)·표시명(기능명 title) 추출
│   │   ├── blockParser.ts           # 블록 트리 재귀 탐색 + children 페이지네이션
│   │   ├── responseJsonExtractor.ts # code 블록 분류(첫 줄 패턴) + HTTP 상태줄 제거 + 3단계 우선순위
│   │   ├── errorCaseParser.ts       # "예외 상황" 텍스트(블록 타입 무관) 이후 첫 table 파싱
│   │   └── richText.ts              # plain_text 병합 공용 유틸
│   ├── mock/
│   │   ├── routeRegistry.ts         # Express 라우트 등록 + CORS + 404 폴백
│   │   └── server.ts                # 기동 + 콘솔 출력
│   └── types/
│       └── domain.ts                # EndpointSpec, ErrorCase
├── tests/
│   ├── fixtures/                    # 실 Notion API 응답을 저장한 JSON (Phase 0에서 실 DB로부터 채집)
│   ├── responseJsonExtractor.test.ts
│   ├── errorCaseParser.test.ts
│   ├── propertyExtractor.test.ts
│   └── databaseFetcher.test.ts      # URL→ID 추출 로직만
├── .env.example / .gitignore / package.json / tsconfig.json / README.md
```

의존성: `commander`, `express@^4`, `cors`, `@notionhq/client@^5`, `dotenv` / dev: `typescript`, `tsx`, `vitest`, `@types/node`, `@types/express@^4`, `@types/cors`

설계 원칙: 파서 모듈은 **Notion API 호출부와 순수 파싱 로직을 분리**한다 — 파싱 함수는 블록/프로퍼티 JSON을 인자로 받는 순수 함수로 만들어 fixture 테스트가 가능하게 한다.

---

## 구현 단계 (진행 추적)

### Phase 0: 초기화 + 실 DB 연결 검증

- [x] `npm init`, tsconfig(strict, NodeNext), 의존성 설치
- [x] `.env.example` 작성, `.gitignore`(`.env` 포함)
- [x] npm scripts 구성 (`dev`=tsx, `build`=tsc, `test`=vitest)
- [x] `notionClient.ts` — 토큰 누락 시 즉시 종료 + 안내
- [x] 실 DB로 `databases.retrieve` → `data_sources` 배열 확인
- [x] `dataSources.query`로 페이지 1개 조회, `blocks.children.list`로 블록 raw JSON 출력
- [x] 실 응답 JSON을 `tests/fixtures/`에 저장 (GET/POST/PUT/DELETE 유형별 페이지 각 1개, 스펙 3.2절에서 언급한 4개 실 예시와 동일한 페이지로 확보: `get-200-submission-detail`, `post-201-team-member`, `put-204-sort`, `delete-204-category`)

**Phase 0 실 DB 검증 결과 — 스펙/계획서 가정과 다른 부분 발견 (Phase 1 구현 시 반드시 반영):**

1. **`HTTP Method`, `응답코드` 프로퍼티는 Select가 아니라 `multi_select` 타입.** 값은 배열로 온다 (`multi_select: [{ name: "GET" }]`). `propertyExtractor.ts`는 배열의 첫 번째 값을 사용하고, 값이 0개면 스킵, 2개 이상이면 경고 후 첫 번째 사용.
2. **`URI`는 Title이 아니라 `rich_text` 타입이고, 실제 Title 프로퍼티는 `기능명`**(예: "팀원 등록", "회원 탈퇴")이다. `기능명`이 스펙 4.4절 콘솔 출력의 한국어 엔드포인트 이름(`⚠️ 스킵된 페이지: - 회원 탈퇴 API`)의 출처다. `propertyExtractor.ts`는 URI를 `rich_text`에서, 로그용 표시 이름을 `기능명`(title)에서 추출해야 한다.
3. **`상태`는 계획서 보완사항 #2에서 예상한 대로 실제 Status 타입** (`status.name`) — select/status 분기 로직 그대로 필요.
4. **"예외 상황" 텍스트는 `paragraph`가 아니라 `bulleted_list_item` 블록에 있다** (4개 fixture 전부 동일하게 확인, `heading`도 아님). `errorCaseParser.ts`의 "예외 상황 텍스트 탐색" 로직은 블록 타입을 `paragraph`로 한정하지 말고, rich_text를 가진 모든 블록 타입(paragraph/heading_*/bulleted_list_item 등)을 순회하며 텍스트로 판별해야 한다. 이후 첫 `table` 블록까지는 빈 블록(`paragraph` 등)을 건너뛰고 탐색.
5. **`table.has_column_header`는 4개 fixture 전부 `false`** — 계획서의 "우선 확인 후 없으면 첫 행을 헤더로 간주" 폴백이 사실상 기본 경로가 된다.
6. **POST 팀원 등록 예시의 에러 케이스 7개(400×3, 404×1, 409×1, 401×1, 403×1) 정확히 일치 확인.** 단, 409 셀 값이 `"409 Conflict"`처럼 코드 뒤에 텍스트가 붙어 있어 계획서의 "선행 정수만 추출" 규칙이 실제로 필요함이 확인됨 (403 셀도 `"403 "`처럼 trailing space 있음).
7. **응답코드 값 중 `302`(리다이렉트)도 존재** (`GET /oauth2/authorization/google -> 302`). 현재 도메인 타입은 200대 성공 코드만 가정하지 않으므로 그대로 처리 가능하나, 204 전용 분기 로직과 겹치지 않는지 유의.
8. **DB 전체 페이지 수 120개, 100개 초과라 페이지네이션 로직이 실제로 발동됨** — `has_more`/`next_cursor` 루프 없이는 페이지 목록의 20개가 누락됐을 것.

### Phase 1: 파싱 모듈 (+ 단위 테스트 병행)

- [x] `richText.ts` — plain_text 병합 유틸
- [x] `databaseFetcher.ts` — URL→ID 추출 (32hex, 하이픈/쿼리스트링 처리) — SDK 제공 `extractDatabaseId` 헬퍼를 래핑해 사용 (D-009)
- [x] `databaseFetcher.ts` — data_source 조회 + 페이지네이션 (`has_more` 루프)
- [x] `databaseFetcher.ts` — 상태 필터: 전량 조회 후 클라이언트 사이드에서 select/status 값을 읽어 필터링 (D-010, 계획서의 서버사이드 select/status 분기 대신 단순화)
- [x] `databaseFetcher.ts` — 스킵된 페이지 목록 수집(표시명은 `기능명` title 프로퍼티 사용, 스펙 4.4절 콘솔 출력 형식과 일치) + 경고 출력
- [x] `propertyExtractor.ts` — Method/응답코드는 `multi_select` 배열의 첫 값 사용(0개면 스킵+경고, 2개 이상이면 경고 후 첫 값 사용), URI는 `rich_text`, 표시명은 `기능명`(title)에서 추출. 필수 누락 시 스킵 + 경고
- [x] `blockParser.ts` — 블록 트리 재귀 탐색 + children 페이지네이션
- [x] `responseJsonExtractor.ts` — 첫 줄 패턴 분류 (`{METHOD} /` → 무시, `HTTP/1.1` → 상태줄 제거 후 본문 추출, `{`/`[` → 본문)
- [x] `responseJsonExtractor.ts` — 3단계 우선순위 (204 → 응답 블록 → `{}`)
- [x] `responseJsonExtractor.ts` — JSON.parse 검증 경고, 복수 응답 후보 시 첫 번째 사용 + 경고
- [x] `errorCaseParser.ts` — "예외 상황" 텍스트 탐색은 `paragraph`로 한정하지 않고 rich_text를 가진 모든 블록 타입(`bulleted_list_item` 포함 — 실 데이터에서 이 타입으로 확인됨)을 순회. 이후 빈 블록을 건너뛰고 첫 `table` 블록까지 탐색
- [x] `errorCaseParser.ts` — `has_column_header` 우선 확인(실 데이터는 전부 `false`라 첫 행 헤더 폴백이 기본 경로), 응답코드 셀 선행 정수 추출 + trim(`"409 Conflict"`, `"403 "` 등 실제 확인됨)
- [x] 단위 테스트: `databaseFetcher.test.ts` (URL→ID 추출)
- [x] 단위 테스트: `propertyExtractor.test.ts` (multi_select 0개/1개/2개, rich_text URI, 기능명 title 추출 케이스)
- [x] 단위 테스트: `responseJsonExtractor.test.ts` — `tests/fixtures/{get-200-submission-detail,post-201-team-member,put-204-sort,delete-204-category}.json` 4개로 GET(응답 JSON 있음)/POST(없음→`{}`)/PUT(204 우선 처리)/DELETE(204, 요청 code 블록이 `java` 태그라도 정상 무시) 네 분기 고정
- [x] 단위 테스트: `errorCaseParser.test.ts` — `tests/fixtures/post-201-team-member.json`로 7개 에러 케이스(400×3, 404×1, 409×1, 401×1, 403×1) 추출 고정, `bulleted_list_item` 기반 "예외 상황" 탐색과 선행 정수 추출 포함

### Phase 2: 목서버 + CLI 통합

- [ ] `routeRegistry.ts` — `{var}` → `:var` 변환 + 동적 라우트 등록
- [ ] `routeRegistry.ts` — 핸들러: 204는 빈 본문(Content-Type 생략), 그 외 hasBody=false는 `'{}'`
- [ ] `routeRegistry.ts` — `cors()` 전역 적용
- [ ] `routeRegistry.ts` — 중복 Method+URI 감지 + 경고
- [ ] `routeRegistry.ts` — 404 폴백 핸들러 (등록 엔드포인트 힌트 포함)
- [ ] `server.ts` — 기동 로그 (스펙 4.4절 출력 형식)
- [ ] `index.ts` — Commander(`--db` 필수, `--status`, `--port` 기본 8080) → 파싱 → 조립 → 기동

### Phase 3: 마무리

- [ ] 429 재시도 (Retry-After 존중, 최대 3회)
- [ ] 잘못된 URL / 멀티 데이터소스 / 토큰 누락 각각 명확한 에러 메시지
- [ ] `npm run build` 정상 동작 확인
- [ ] README 작성 (설치, 토큰 발급 PAT 권장, 사용법, 알려진 한계는 [TRADEOFFS.md](TRADEOFFS.md) 요약해서 명시)
- [ ] (선택) `package.json`에 `bin` 필드 추가

---

## 검증 방법

- **단위**: `npm test` — 실 Notion 응답 fixture로 파서 회귀 검증
- **E2E (실 DB)**: `npm run dev -- --db {실제 DB URL} --status 완료` 기동 후:
  - [ ] `curl http://localhost:8080/contests/1/submissions/12` → 명세의 JSON 그대로 반환
  - [ ] 204 엔드포인트 → 빈 본문 + Content-Type 없음
  - [ ] 본문 미문서화 POST → `201` + `{}`
  - [ ] 미등록 경로 → 404 + 힌트 JSON
  - [ ] 브라우저 콘솔에서 `fetch()` 호출로 CORS 동작 확인
  - [ ] 콘솔 출력: 스킵 페이지 목록, 등록 엔드포인트/에러 케이스 개수 표시 확인
