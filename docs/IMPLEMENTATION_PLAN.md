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

- [x] `pageParser.ts` — Phase 1 파서들을 묶는 오케스트레이터(신규, 계획서 구조엔 있었으나 Phase 1 체크리스트에서 누락됐던 항목) 추가
- [x] `routeRegistry.ts` — `{var}` → `:var` 변환 + 동적 라우트 등록
- [x] `routeRegistry.ts` — 핸들러: 204는 빈 본문(Content-Type 생략), 그 외 hasBody=false는 `'{}'`
- [x] `routeRegistry.ts` — `cors()` 전역 적용
- [x] `routeRegistry.ts` — 중복 Method+URI 감지 + 경고
- [x] `routeRegistry.ts` — 404 폴백 핸들러 (등록 엔드포인트 힌트 포함)
- [x] `server.ts` — 기동 로그 (스펙 4.4절 출력 형식)
- [x] `index.ts` — Commander(`--db` 필수, `--status`, `--port` 기본 8080) → 파싱 → 조립 → 기동

### Phase 3: 마무리

**Phase 3 착수 전 실제 코드 대조 결과 — 계획서 항목 중 일부는 이미 구현되어 있었음:**

1. **429 재시도는 `@notionhq/client`(v5.23.0)가 이미 내장 지원한다.** `node_modules/@notionhq/client/build/src/Client.js`의 `executeWithRetry`/`canRetry`/`calculateRetryDelay`/`parseRetryAfterHeader`가 429(`rate_limited`)·529(`service_overload`)에 대해 `Retry-After` 헤더를 우선 존중하고, 없으면 exponential backoff로 재시도한다(기본 `maxRetries: 2`). `Client` 생성 시 `retry` 옵션으로 조정 가능. 계획서가 요구하는 "최대 3회"와 기본값(2회)이 다르므로, 커스텀 재시도 로직을 새로 작성하는 대신 `retry: { maxRetries: 3 }`만 명시적으로 설정한다 — D-009("이미 검증된 공식 구현을 재작성하지 않는다")와 동일한 논리.
2. **"잘못된 URL / 멀티 데이터소스 / 토큰 누락" 에러 메시지는 Phase 0~1에서 이미 구현 완료됨.** 코드 대조 확인:
   - 토큰 누락 → `src/notion/notionClient.ts:6-10`, 이미 2줄 안내 후 `process.exit(1)`.
   - 잘못된 URL → `src/notion/databaseFetcher.ts:15-21` `parseDatabaseId`, 이미 명확한 에러(D-009), `tests/databaseFetcher.test.ts:47-51`로 고정됨.
   - 멀티 데이터소스 → `src/notion/databaseFetcher.ts:23-43` `resolveDataSourceId`, 이미 데이터소스 개수 포함한 명확한 에러를 던짐. **단, 이 함수는 현재 유닛 테스트가 없다** (0개/1개/2개+ 케이스 미검증).
   → 새 에러 처리 코드 작성은 불필요. 남은 일은 (a) `resolveDataSourceId` 테스트 보강, (b) 실제 CLI 실행으로 세 시나리오의 콘솔 출력이 실사용자 관점에서 충분히 명확한지 확인.
3. `npm run build`, README는 실제로 미착수 상태 그대로 — 아래 단위대로 진행.

**구현 단위 (커밋 경계):**

- [x] **Unit 1 — 429 재시도 최대 횟수 설정**
  - `src/notion/notionClient.ts`: `new Client({ auth: token, retry: { maxRetries: 3 } })`로 수정.
  - `docs/DECISIONS.md`에 D-015 추가 (SDK 내장 재시도를 재구현하지 않고 옵션만 조정한 근거).
  - 검증: 실제 429 유발은 현실적으로 어려워 별도 통합 테스트는 만들지 않고, `npm test`(55개) 회귀 없음 확인 + DECISIONS.md에 근거 기록으로 대체.
  - 커밋: `feat(notion): 429 재시도 최대 횟수를 3회로 명시 설정`

- [x] **Unit 2 — 에러 메시지 검증 + 테스트 보강**
  - `tests/databaseFetcher.test.ts`에 `resolveDataSourceId` 테스트 4건 추가: 데이터소스 0개(에러) / 1개(정상 반환) / 2개 이상(멀티 데이터소스 에러, 개수 포함 메시지 확인) / 비-database 응답(에러).
  - 실행 검증(코드 변경 없음, 확인만): `NOTION_TOKEN` 없이 실행 → 안내 메시지 확인 완료 / `--db https://example.com/not-a-notion-url` 실행 → `Notion DB URL에서 database_id를 추출할 수 없습니다` 에러 확인 완료. 멀티 데이터소스 실 DB는 없으므로 이 경로는 유닛 테스트로만 고정하고 실 DB 검증은 생략.
  - 커밋: `test(notion): 데이터소스 조회 실패 케이스(0개/멀티) 유닛 테스트 추가`

- [x] **Unit 3 — `package.json` `bin` 필드 → 이번 Phase 3에서는 스킵하기로 확정 (사용자 결정, [T-009](TRADEOFFS.md) 참고)**
  - 아직 npm publish 계획이 없어 지금 추가해도 실익이 없다고 판단, 필요해지면 그때 추가하기로 함. 커밋 없음(변경 없음).

- [x] **Unit 4 — 빌드/E2E 검증 게이트**
  - `npm run build` (dist 삭제 후 클린 빌드) 에러 없이 통과 확인.
  - `node dist/index.js --db {실DB} --status 완료`로 컴파일된 결과물 기동 재확인 — 실 DB 120페이지 중 상태 필터 적용 후 108개 처리·107개 엔드포인트 등록(실 DB가 팀에 의해 계속 갱신되는 라이브 문서라 Phase 2 검증 시점의 119개와는 수치가 다름 — 코드 문제 아님).
  - `curl`로 미등록 경로 404(등록 엔드포인트 힌트 포함), `Access-Control-Allow-Origin: *` CORS 헤더, 실제 등록된 GET 엔드포인트의 JSON 응답 모두 정상 확인.
  - 문제 미발견으로 별도 수정 커밋 없음.

- [x] **Unit 5 — README.md 작성**
  - 신규 파일. 목차: 소개 → 설치 → Notion DB 템플릿 요구사항(실 데이터 기준 프로퍼티 타입 명시) → 토큰 발급(PAT 권장 근거) → 사용법(CLI 옵션) → 실행 예시 → 알려진 한계(TRADEOFFS.md 요약+링크) → 관련 문서 링크.
  - 커밋: `docs: README 작성 (설치·사용법·알려진 한계)`

**순서**: Unit 1 → Unit 2 → Unit 3(사용자 확인 후) → Unit 4(게이트) → Unit 5. 각 단위 완료·검증 즉시 그 자리에서 커밋(CLAUDE.md 원칙). Phase 3 전체 완료 — `docs/AI_COLLABORATION_LOG.md`에 세션 기록 추가함.

### Phase 4: 실사용 피드백 대응

**배경**: Phase 3 완료 후 실 DB(`--db` 실제 URL)로 직접 실행한 결과, 파싱 경고 로그(`⚠️ 응답코드에서 숫자를 찾을 수 없어...`, `⚠️ 유효하지 않은 JSON입니다...` 등)가 정확히 어느 Notion 페이지에서 발생했는지 식별할 수 없다는 문제 발견. `pageParser.ts`가 페이지 단위로 순회하며 페이지 제목(`displayName`)과 URL(`page.url`)을 이미 갖고 있음에도, 경고를 실제로 출력하는 `responseJsonExtractor.ts`/`errorCaseParser.ts`/`propertyExtractor.ts`의 함수들에는 이 정보가 전달되지 않고 있었다.

**구현 단위 (커밋 경계):**

- [x] **Unit 1 — 파싱 경고 로그에 페이지 식별 정보(제목+URL) 추가**
  - `src/notion/responseJsonExtractor.ts`: `extractResponseJson(blocks, successStatusCode, pageLabel?)` 시그니처에 `pageLabel` 추가(기본값 `'(알 수 없는 페이지)'`), 두 warn에 `[${pageLabel}]` 접두사 적용.
  - `src/notion/errorCaseParser.ts`: `extractErrorCases(blocks, pageLabel?)` → `parseErrorTable(tableBlock, pageLabel?)`까지 전달, 두 warn에 접두사 적용.
  - `src/notion/propertyExtractor.ts`: 이미 계산된 `displayName`(15행)을 `extractMultiSelectFirst(prop, displayName)`에 전달해 warn에 접두사 적용. 외부 `extractProperties` 시그니처는 변경 없음.
  - `src/notion/pageParser.ts`: `parsePage` 내부에서 `pageLabel = \`${displayName} (${page.url})\`` 생성 후 위 호출부에 전달.
  - 검증: `npm run build` + `npm test`(기존 55개 테스트 무변경 통과 — 새 파라미터는 옵션이라 기존 호출부 영향 없음) + 실 DB로 `npm run dev` 재실행해 경고 줄마다 페이지 제목+URL이 붙는지 육안 확인.
  - 커밋: `fix(notion): 파싱 경고 로그에 페이지 식별 정보(제목+URL) 추가`

- [x] **Unit 2 — 파싱 경고 로그에 섹션 정보와 Notion 블록 딥링크 추가**
  - **배경**: Unit 1로 페이지는 식별 가능해졌지만, 사용자가 "예외 상황 표의 어느 행이 문제인지까지 보고 싶다"고 요청. Notion은 페이지 URL 뒤에 `#{블록ID(대시 제거)}`를 붙이면 그 블록으로 바로 스크롤하는 딥링크(공식 "블록에 링크 복사" 기능과 동일 형식)를 지원한다.
  - 신규 `src/notion/pageContext.ts`: `buildPageContext(displayName, pageUrl, sectionLabel, blockId?)` — `blockId`가 있으면 `${pageUrl}#${blockId 대시 제거}`, 없으면 `pageUrl`만, `pageUrl`도 없으면(테스트 기본값) 링크 없이 텍스트만 반환.
  - `src/notion/responseJsonExtractor.ts`: 후보 code 블록 수집 시 텍스트뿐 아니라 `block.id`도 함께 보존(`{id, text}[]`)하도록 변경. `extractResponseJson(blocks, successStatusCode, displayName?, pageUrl?)`로 확장, 두 경고 모두 섹션명 "응답 예시 code 블록" + 첫 번째(사용되는) 후보의 블록ID로 딥링크 생성.
  - `src/notion/errorCaseParser.ts`: `extractErrorCases(blocks, displayName?, pageUrl?)` → `parseErrorTable(tableBlock, displayName, pageUrl)`. 행 순회 중 `row.id`를 블록ID로 사용해 섹션명 "예외 상황 표" + 해당 행 딥링크 생성.
  - `src/notion/propertyExtractor.ts`: `extractProperties(properties, pageUrl?)`로 확장. `extractMultiSelectFirst(prop, fieldName, displayName, pageUrl)`에서 섹션명은 실제 프로퍼티 이름("HTTP Method"/"응답코드")을 그대로 사용 — 프로퍼티는 블록ID가 없어 페이지 링크까지만 제공.
  - `src/notion/pageParser.ts`: 기존에 미리 조합해두던 `pageLabel` 문자열 생성 로직을 제거하고, `displayName`과 `page.url`을 그대로 하위 호출부에 전달.
  - 신규 단위 테스트 `tests/pageContext.test.ts`: blockId 있음/없음, pageUrl 있음/없음 조합 케이스.
  - 검증: `npm run build` + `npm test`(신규 테스트 포함, 기존 케이스 시그니처 무변경) + 실 DB로 재실행해 경고에 찍힌 URL을 실제로 열어 문제의 행/code 블록으로 스크롤되는지 육안 확인.
  - 커밋: `feat(notion): 파싱 경고 로그에 섹션 정보와 Notion 블록 딥링크 추가`

**순서**: Unit 1 → Unit 2 (Unit 2는 Unit 1이 도입한 `pageLabel` 파라미터를 대체하므로 순서 의존).

---

### Phase 5: 시작 속도 개선 (로컬 캐시)

**배경**: 실 DB(120페이지) 기준 매 실행마다 페이지당 블록 트리를 재귀로 새로 조회하느라 시작에 2~3분이 걸림. 실측 결과 병목은 페이지 목록 조회(전체 0.6초)가 아니라 페이지당 `fetchBlockTree`(페이지당 0.9~2.2초)임을 확인함. 또한 실 DB 라이브 테스트(표 행 블록에 공백 추가 후 원복)로, 페이지 내 블록을 수정하면 상위 페이지의 `last_edited_time`도 함께 갱신됨을 확인함 — 이 전제 위에서 "페이지 목록만 먼저 조회해 `last_edited_time`이 바뀐 페이지만 재파싱"하는 캐싱이 안전하다고 판단.

**설계 요점**:
- 캐시는 페이지별 **블록 파싱 결과만** 저장한다(`hasBody`/`successResponseJson`/`errorCases`). `method`/`uriPattern`/`successStatusCode`(프로퍼티에서 추출, 네트워크 호출 없이 이미 조회된 `page.properties`로 즉시 계산 가능)는 캐시 여부와 무관하게 매번 새로 계산 — 캐시 히트 여부와 무관하게 항상 최신값을 쓴다.
- `--status` 필터는 캐싱과 무관 — `databaseFetcher.ts`가 이미 전량 조회 후 클라이언트 사이드로 필터링하므로(D-010), 캐시는 필터와 상관없이 페이지 단위로만 저장하면 된다.
- 캐시 파일에 `schemaVersion` 필드를 둬서, 파서 로직 자체가 바뀌었을 때(버그 수정 등) 페이지가 안 바뀌어도 캐시를 강제로 무효화할 수 있게 한다.
- DB URL(`dataSourceId`)이 바뀌면 캐시 전체를 무효화(별도 멀티-DB 캐시는 만들지 않음 — 단순함 우선).
- 캐시 파일 손상/스키마 불일치 시 조용히 빈 캐시로 폴백(D-013과 동일한 "안전한 기본값" 정책).
- 캐시 파일에 없는(=이번 실행 결과에 없는) 페이지는 자연히 드롭됨 — 별도 삭제 로직 불필요.
- `--no-cache` 플래그로 이번 실행만 캐시를 읽지도 쓰지도 않는 완전 우회 옵션 제공.

**구현 단위 (커밋 경계):**

- [x] **Unit 1 — 캐시 저장소 모듈(`specCache.ts`) + 단위 테스트**
  - 신규 `src/notion/specCache.ts`: `SpecCache { schemaVersion, dataSourceId, entries: Record<pageId, { lastEditedTime, result: CachedBlockResult }> }`, `CachedBlockResult { hasBody, successResponseJson, errorCases }` 타입.
  - `loadCache(path, dataSourceId)`: 파일 읽기 → JSON.parse → `schemaVersion`/`dataSourceId` 불일치 또는 파싱 실패 시 빈 캐시(`{schemaVersion: CURRENT, dataSourceId, entries: {}}`) 반환.
  - `saveCache(path, cache)`: JSON.stringify 후 파일 쓰기.
  - `getCached(cache, pageId, lastEditedTime)`: `entries[pageId]`가 있고 `lastEditedTime`이 일치하면 `result` 반환, 아니면 `undefined`.
  - 신규 `tests/specCache.test.ts`: 히트/미스(다른 lastEditedTime)/`schemaVersion` 불일치/`dataSourceId` 불일치/손상된 JSON 파일 폴백 케이스.
  - 커밋: `feat(notion): 페이지별 파싱 결과 로컬 캐시 저장소(specCache) 추가`

- [x] **Unit 2 — pageParser.ts에 캐시 조회/반환 연결**
  - `parsePage(notion, page, oldCache?)`: 프로퍼티 추출은 항상 새로 실행, `getCached(oldCache, page.id, page.last_edited_time)` 히트 시 `fetchBlockTree` 자체를 건너뛴다.
  - `PageParseResult`의 성공 케이스에 `cacheEntry: { pageId, lastEditedTime, result: CachedBlockResult }`를 포함(호출자가 새 캐시를 조립할 수 있도록 — `parsePage` 자체는 파일 I/O를 하지 않고 순수하게 유지).
  - `parseAllPages(notion, pages, oldCache?)`: 각 페이지의 `cacheEntry`를 모아 새 `SpecCache` 반환(파일 저장은 안 함), 캐시 적중/미스 개수(`cacheHits`, `cacheMisses`)도 `ParseAllResult`에 포함.
  - 기존 `pageParser.ts`는 전용 단위 테스트가 없는 오케스트레이터(E2E 검증 대상)라 시그니처 변경에 따른 기존 테스트 영향 없음.
  - 커밋: `feat(notion): pageParser가 캐시 히트 시 블록 조회를 건너뛰도록 변경`

- [x] **Unit 3 — CLI 통합(`--no-cache` 플래그 + 캐시 로드/저장)**
  - `index.ts`: Commander에 `--no-cache` boolean 옵션 추가(기본 캐시 사용).
  - 캐시 파일 경로 상수 `.notion-mock-cache.json`(프로젝트 CWD 기준).
  - `--no-cache` 미지정 시: `loadCache` → `parseAllPages(notion, pages, oldCache)` → 결과를 `saveCache`로 저장. `--no-cache` 지정 시: 로드/저장 모두 생략.
  - 콘솔 출력에 `캐시 적중 N개, 새로 파싱 M개` 요약 추가.
  - `.gitignore`에 `.notion-mock-cache.json` 추가.
  - 커밋: `feat: --no-cache 플래그와 캐시 로드/저장을 CLI에 연결`

- [x] **Unit 4 — 검증**
  - `npm run build` + `npm test`(66개) 통과.
  - 실 DB(119페이지) 연속 실행 실측: **1회차(캐시 없음) 159초, 적중 0/미스 119** → **2회차(캐시 있음, 무변경) 5초, 적중 119/미스 0** — 약 32배 단축.
  - 표 행 블록 하나를 실제로 편집(라이브 테스트, 이후 원상복구)한 뒤 3회차 실행 — **4초, 적중 118/미스 1**로 그 페이지만 정확히 재파싱됨을 확인.
  - `--no-cache` 실행 — **141초, 적중 0/미스 119 (--no-cache 표시)**, 캐시 파일 수정 시각 불변(로드/저장 모두 생략됨) 확인.
  - 문제 미발견으로 별도 수정 커밋 없음(Phase 3 Unit 4와 동일한 패턴).

**순서**: Unit 1 → Unit 2 → Unit 3 → Unit 4 (각 유닛이 앞 유닛의 타입/함수에 의존).

---

### Phase 6: PR #4 코드 리뷰 대응

**배경**: [PR #4](https://github.com/sjmoon00/mocktion/pull/4)에 대해 Claude 자체 다각도 리뷰(8앵글) + GitHub Copilot을 종합한 `docs/reviews/2026-07-11-phase4-5-warnings-cache-code-review.md`(8개 finding) 작성됨. 신뢰 여부를 채팅으로만 판단하지 않고, 11개 독립 에이전트(finding당 1개 + Finding 1 크래시 주장에 대한 반박 시도 3개)로 실제 현재 소스와 대조 검증 — **8개 finding 전부 CONFIRMED**, Finding 1(크래시)은 3개의 독립 반박 시도가 모두 실패(그중 2개는 Node.js 재현 스크립트로 실측)해 신뢰도가 특히 높음.

**구현 단위 (커밋 경계):**

- [x] **Unit 1 — Finding 1(High) 수정: 캐시 항목 shape 검증 후 손상 시 미스로 취급**
  - `src/notion/specCache.ts`의 `getCached`: `entry.result`를 반환하기 전에 `hasBody`(boolean)/`successResponseJson`(string)/`errorCases`(Array) 타입을 검증. 하나라도 어긋나면 `undefined`(캐시 미스로 취급 → 자동으로 재파싱되어 자가 치유) 반환. `docs/IMPLEMENTATION_PLAN.md`가 이미 명시한 "캐시 손상 시 조용한 폴백(D-013 정책)"을 entry 레벨까지 확장하는 것.
  - `tests/specCache.test.ts`에 "lastEditedTime은 일치하지만 result shape가 잘못된 경우 undefined 반환" 케이스 추가.
  - 커밋: `fix(notion): 캐시 항목 shape 검증 실패 시 미스로 취급해 목서버 크래시 방지`

- [ ] **Unit 2 — Finding 2(Medium) 수정: 파싱 경고를 캐시에 저장해 캐시 히트에도 재출력**
  - `src/notion/responseJsonExtractor.ts`: `console.warn` 직접 호출 2곳을 제거하고, 대신 발생한 경고 문구를 `warnings: string[]`로 모아 반환값에 포함.
  - `src/notion/errorCaseParser.ts`: 동일하게 `console.warn` 2곳을 `warnings: string[]`로 전환.
  - `src/notion/pageParser.ts`: `CachedBlockResult`에 `warnings: string[]` 필드 추가, `fetchAndParseBlocks`가 두 함수의 `warnings`를 합쳐 반환.
  - `src/index.ts`: `parseAllPages` 완료 후, 캐시 히트/미스 무관하게 모든 `spec`(또는 `ParseAllResult`가 노출하는 결과)의 `warnings`를 순회해 콘솔에 출력 — 캐시 히트여도 매 실행마다 동일한 경고가 다시 보이게 됨.
  - `tests/responseJsonExtractor.test.ts`/`tests/errorCaseParser.test.ts`: 반환값 shape 변경(`warnings` 필드 추가)에 맞춰 기존 단정문 갱신, 경고가 실제로 `warnings` 배열에 담기는지 확인하는 케이스 추가.
  - 커밋: `fix(notion): 파싱 경고를 캐시에 저장해 캐시 히트 시에도 매번 재출력`

- [ ] **Unit 3 — Finding 3(Medium) 수정: 일시적 파싱 실패 시 기존 캐시 항목 보존**
  - `src/notion/pageParser.ts`의 `parseAllPages`: `result.ok`가 `false`인 페이지(속성 스킵이든 블록 파싱 실패든)라도, `oldCache`에 해당 `page.id`의 기존 항목이 있으면 `newCache`로 그대로 이월. `pages`에 없는(삭제/필터 제외된) 페이지는 애초에 루프를 안 돌므로 자연히 드롭되는 기존 동작과 충돌하지 않음.
  - 이 유닛은 `pageParser.ts`에 전용 단위 테스트가 없는 기존 관례(오케스트레이터, E2E 검증 대상)를 따름 — Unit 7에서 시나리오 재현으로 확인.
  - 커밋: `fix(notion): 페이지 파싱이 일시적으로 실패해도 기존 캐시 항목은 보존`

- [ ] **Unit 4 — Finding 5(Low) 수정: `PageParseResult`의 `cacheEntry` 중복 제거**
  - `src/notion/pageParser.ts`: `PageParseResult` 성공 케이스에서 `cacheEntry`를 제거하고 `cacheHit`만 남김. `parseAllPages`가 `page.id`/`page.last_edited_time`/`result.spec`의 세 블록 필드(`hasBody`/`successResponseJson`/`errorCases`, Unit 2에서 `warnings` 포함)로 캐시 항목을 직접 조립.
  - Unit 2가 `CachedBlockResult` shape를 먼저 확정하므로 Unit 2 이후에 진행.
  - 커밋: `refactor(notion): PageParseResult의 캐시 데이터 중복 보관 제거`

- [ ] **Unit 5 — Finding 6(Low) 수정: 캐시 파일 원자적 쓰기**
  - `src/notion/specCache.ts`의 `saveCache`: 임시 파일(`${filePath}.tmp`)에 먼저 쓴 뒤 `fs.renameSync`로 교체하는 방식으로 변경.
  - 커밋: `fix(notion): 캐시 파일을 원자적으로 저장(임시 파일 + rename)`

- [ ] **Unit 6 — Finding 7(Low) + Finding 4(Medium, 미검증 전제) 대응: 문서 동기화**
  - `docs/IMPLEMENTATION_PLAN.md`: Phase 5 Unit 2 설명의 `parseAllPages` 시그니처를 실제 코드(`dataSourceId` 인자 포함, Unit 4 반영 후 최종 형태)에 맞춰 정정.
  - `docs/DECISIONS.md`: D-016(캐시 유효성 판단 전략 — `schemaVersion`/`dataSourceId`/entry shape 검증 조합) 추가.
  - `docs/DECISIONS.md`: D-017(파싱 경고를 캐시에 저장해 매 실행 재출력하는 방식, Unit 2 근거) 추가.
  - `docs/TRADEOFFS.md`: T-010("DB URL 변경 시 멀티-DB 캐시 없이 전체 무효화") 추가.
  - `docs/TRADEOFFS.md`: T-011(child_page/동기화 블록이 포함된 페이지의 `last_edited_time` 전파는 실측 검증되지 않은 알려진 한계 — 표 행 편집 1건만 검증됨, 현재 실 DB엔 해당 블록 타입 없음을 근거로 리스크 수용) 추가.
  - 커밋: `docs: Phase 5 캐싱 설계 결정·트레이드오프 기록 및 계획 문서 시그니처 정정`

- [ ] **Unit 7 — 검증**
  - `npm run build` + `npm test` 전체 통과.
  - 손상된 shape의 캐시 파일(예: `errorCases`를 문자열로 오염)을 수동으로 만든 뒤 실행 — 크래시하지 않고 해당 페이지가 재파싱되는지 확인(Finding 1 회귀 방지).
  - 캐시가 있는 상태로 재실행해, 이전에 경고가 났던 페이지의 경고가 이번에도 다시 출력되는지 확인(Finding 2 회귀 방지).
  - 페이지 파싱을 인위적으로 1회 실패시킨 뒤(예: 네트워크 차단 시뮬레이션이 어려우면 코드 레벨 임시 변경으로 재현) 캐시 파일에 해당 페이지 항목이 남아있는지 확인(Finding 3 회귀 방지).
  - 문제 발견 시에만 별도 수정 커밋.

**순서**: Unit 1 → Unit 2 → Unit 3 → Unit 4 → Unit 5 → Unit 6 → Unit 7 (Unit 3·5는 Unit 1·2와 파일이 겹치지 않아 순서를 서로 바꿔도 무방하나, Unit 4는 Unit 2 완료 후, Unit 6은 전체 코드 변경 완료 후 진행).

---

## 검증 방법

- **단위**: `npm test` — 실 Notion 응답 fixture로 파서 회귀 검증
- **E2E (실 DB)**: `npm run dev -- --db {실제 DB URL} --status 완료` 기동 후:
  - [x] `curl http://localhost:8123/contests` → 명세의 JSON 그대로 반환 (실 DB 120페이지, 119개 엔드포인트 등록 확인)
  - [x] 204 엔드포인트(`DELETE /admin/teams/{teamId}/awards`) → 빈 본문 + Content-Type 없음
  - [x] 본문 미문서화 POST → 실제로는 `POST /teams`가 `{"teamId": 1}` JSON 예시를 갖고 있어 `201` + 해당 JSON 반환 확인 (3순위 빈 객체 폴백 경로는 fixture 단위 테스트로 별도 검증됨)
  - [x] 미등록 경로 → 404 + 등록된 엔드포인트 119개 힌트 JSON
  - [x] `curl -H "Origin: ..."` 로 `Access-Control-Allow-Origin: *` 헤더 확인 (CORS 동작)
  - [x] 콘솔 출력: 총 페이지 수, 파싱 경고(응답코드 파싱 실패/JSON 여러 개/유효하지 않은 JSON), 스킵 페이지(`URI 값이 없습니다`), 등록 엔드포인트 119개·에러 케이스 365개 표시 확인
