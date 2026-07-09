# 기술적 의사결정 로그 (Decision Log)

> 이 문서는 "무엇을 선택했고 왜인가"를 기록한다. 포기한 것에 대한 근거는 [TRADEOFFS.md](TRADEOFFS.md), AI와 실제로 협업한 과정은 [AI_COLLABORATION_LOG.md](AI_COLLABORATION_LOG.md)를 참고.
> 각 항목은 ADR(Architecture Decision Record) 형식: 배경 → 결정 → 검토한 대안 → 근거.

---

## D-001: Java가 아니라 Node.js/TypeScript

- **배경**: 개발자 본인의 주력 스택은 Java/Spring Boot. 처음엔 그 스택으로 설계했다.
- **결정**: Node.js + TypeScript로 전환.
- **검토한 대안**: Java/Spring Boot (원래 계획).
- **근거**: 이 도구의 실사용자는 목서버를 직접 실행하는 **프론트엔드 개발자**다. JVM 설치가 필요 없고 `npx` 한 줄로 실행 가능한 쪽이 실행 환경 허들을 만들지 않는다. "내가 잘 아는 스택"이 아니라 "실사용자에게 마찰이 적은 스택"을 기준으로 판단했다. (근거: [notion-mockserver-spec.md](../notion-mockserver-spec.md) 1.4절)

---

## D-002: 단일 데이터소스 Notion DB만 지원

- **배경**: Notion API 2025-09-03 버전부터 Database가 1개 이상의 Data Source를 담는 컨테이너 구조로 변경됨 (`Database → Data Source → Pages`).
- **결정**: 멀티 데이터소스 DB는 스코프 밖으로 명시적으로 제외, 첫 번째 data source만 사용.
- **검토한 대안**: 모든 data source를 순회해 병합.
- **근거**: 사용자가 직접 만드는 일반적인 Notion DB는 대부분 단일 데이터소스다. 멀티 데이터소스는 복잡도 대비 실사용 효용이 낮은 엣지 케이스라 판단. 발견 시 명확한 에러 메시지로 안내(Phase 3). (근거: spec 6.1절, 11절)

---

## D-003: JSON 예시 없는 페이지에 AI로 mock 데이터를 생성하지 않는다

- **배경**: Response 섹션에 JSON 예시가 없는 페이지(실제로도 POST/PUT/DELETE에서 흔함)를 어떻게 채울지 결정 필요.
- **결정**: 빈 객체 `{}`로 등록하고 콘솔에 경고만 표시. AI를 이용한 mock 데이터 생성(fallback)은 하지 않는다.
- **검토한 대안**: LLM으로 프로퍼티 타입을 보고 그럴듯한 JSON을 생성.
- **근거**: 이 프로젝트의 핵심 가치는 "AI로 무언가를 생성한다"가 아니라 "Notion에 이미 작성된 명세를 그대로 반영한다"는 데 있다. 정확한 mock이 필요하면 명세 작성자가 JSON 예시를 채우는 쪽이 파이프라인도 단순하고 명세 작성 습관도 개선시킨다. (근거: spec 3.3절 — "AI로 무언가를 생성한다가 아니라 명세를 그대로 읽어 즉시 쓸 수 있는 목서버를 만든다")

---

## D-004: heading 텍스트/code 블록 language 태그를 신뢰하지 않고, 내용 패턴으로 분류

- **배경**: 초기 설계는 GET 예시 1개만 보고 "heading으로 섹션 구분"을 가정했다. 이후 POST/PUT/DELETE 실 페이지 3개를 추가 검토한 결과 heading이 없는 페이지, 오타(`Reqeust`), `json`/`java`/태그없음이 뒤섞인 code 블록을 확인했다.
- **결정**: 페이지 내 모든 code 블록을 스캔한 뒤, **첫 줄 내용 패턴**(`{METHOD} /...` vs `HTTP/1.1 {코드}` vs `{`/`[`)으로 요청/응답을 분류. heading 위치나 language 태그는 파싱 신호로 사용하지 않는다.
- **검토한 대안**: heading 텍스트 매칭, code 블록의 language 태그 매칭.
- **근거**: 실 데이터 검증(4개 실 예시)으로 두 신호 모두 신뢰할 수 없음이 확인됨. 실제로 Phase 0 fixture 중 하나(`delete-204-category`)도 요청 code 블록에 `language: java` 태그가 붙어 있었지만 규칙대로 정상 무시됨. (근거: spec 3.2절 검증 노트)

---

## D-005: CommonJS + `moduleResolution: NodeNext` (ESM 미채택)

- **배경**: tsconfig 모듈 시스템을 ESM으로 할지 CJS로 할지 결정 필요. Phase 0에서 `@notionhq/client`(v5.23.0) 패키지 메타데이터를 직접 확인.
- **결정**: `package.json`에 `"type": "module"`을 넣지 않고 CommonJS 기본값 유지, tsconfig은 `module`/`moduleResolution` 모두 `NodeNext`.
- **검토한 대안**: 순수 ESM (`"type": "module"`).
- **근거**: `npm view @notionhq/client`로 확인한 결과 해당 패키지에 `"type"` 필드도 `exports` 맵도 없어 CJS가 기본. commander/express/dotenv도 전부 CJS 친화적이라, ESM으로 갈 경우 얻는 이득 없이 `import.meta`/확장자 이슈만 늘어난다. 가장 마찰 적은 선택. (근거: [AI_COLLABORATION_LOG.md](AI_COLLABORATION_LOG.md) 세션 1)

---

## D-006: `notion.dataSources.query()` 전용 메서드 사용 (raw `notion.request()` 미사용)

- **배경**: 스펙 문서 작성 시점(2025-09-03 API 변경 직후)에는 SDK가 전용 메서드를 지원하는지 불확실해 `notion.request()` raw 호출을 안전 대안으로 제시했었다.
- **결정**: `@notionhq/client` v5.23.0을 Phase 0에서 직접 설치해 확인한 결과 `dataSources.retrieve/query/create/update/listTemplates`가 정식 지원되어 이 전용 메서드를 사용.
- **검토한 대안**: `notion.request({ method: 'post', path: 'data_sources/{id}/query' })`.
- **근거**: 전용 메서드가 타입 안정성이 높고 SDK 업그레이드에 따른 유지보수 부담이 적다. (근거: spec 6.1절 "구현 시 재확인 필수" 노트, Phase 0에서 실제 확인)

---

## D-007: Express 4 고정 (5로 전환하지 않음)

- **배경**: Express 5가 이미 나와 있는 시점에서 어떤 버전을 쓸지 결정.
- **결정**: `express@^4` 고정.
- **검토한 대안**: `express@^5`.
- **근거**: `{var}` → `:var` 변환은 Express 4의 `path-to-regexp` v0.x에서 안정적으로 동작이 검증됨. 이 프로젝트 규모(단순 동적 라우트 등록)에서 Express 5 전환으로 얻는 이득이 없다.

---

## D-008: CORS 전역 허용을 필수 기능으로 승격

- **배경**: 최초 계획서에는 CORS 처리가 아예 없었다.
- **결정**: `cors` 패키지를 추가하고 `app.use(cors())`로 전체 허용.
- **검토한 대안**: CORS 미처리(계획서 원안).
- **근거**: 주 사용자가 브라우저(`localhost:3000` 등)에서 `fetch()`를 호출하는 프론트엔드 개발자라는 점을 감안하면, CORS 없이는 이 도구의 핵심 시나리오 자체가 동작하지 않는다. 계획서를 처음 검토하는 단계에서 발견해 반드시 보완해야 할 항목으로 승격시켰다. (근거: IMPLEMENTATION_PLAN.md "기존 계획서 검토" #1)

---

## D-009: DB URL → database_id 추출은 자체 정규식 대신 SDK의 `extractDatabaseId` 헬퍼를 래핑

- **배경**: 계획서(및 spec 3절)는 `https://www.notion.so/{workspace}/{제목}-{32hex}?v={view}` 형태에서 32자리 hex를 직접 정규식으로 추출하는 로직을 전제로 했다. Phase 1 구현 중 `@notionhq/client`(v5.23.0)의 타입 선언(`helpers.d.ts`)을 확인한 결과 `extractDatabaseId`/`extractNotionId`가 이미 공식 헬퍼로 export되어 있고, 하이픈 유무·쿼리스트링·URL 경로 우선 추출까지 계획서가 요구한 처리를 전부 포함하고 있음을 발견했다.
- **결정**: `databaseFetcher.ts`의 `parseDatabaseId()`는 자체 정규식 대신 SDK의 `extractDatabaseId`를 호출하고, 실패 시(`null` 반환 시) 우리 쪽에서 명확한 에러 메시지를 던지는 얇은 래퍼로 구현.
- **검토한 대안**: 계획서 원안의 자체 정규식 구현.
- **근거**: 이미 검증된 공식 구현이 존재하는데 동일한 로직을 재작성하는 것은 불필요한 중복이다. 얇은 래퍼로 감싸 에러 메시지만 프로젝트 관례에 맞게 조정하는 편이 더 단순하고 신뢰도가 높다.

---

## D-010: `--status` 필터는 서버사이드 select/status 분기 대신 전량 조회 후 클라이언트 사이드 필터링

- **배경**: 계획서는 "상태 프로퍼티 타입(select/status)을 감지해 Notion API 필터를 분기하고, 그 외 타입만 클라이언트 사이드로 폴백"하는 방식을 제안했다. 하지만 Phase 0에서 `상태` 프로퍼티가 실제로는 항상 `status` 타입임이 이미 확인됐고(Phase 0 검증 결과 #3), DB 전체 페이지 수도 120개 수준(Phase 0 검증 결과 #8)으로 전량 조회의 비용이 크지 않다.
- **결정**: 서버사이드 필터 없이 `dataSources.query`로 전체 페이지를 조회한 뒤, 각 페이지의 `상태` 프로퍼티 값(`select.name` 또는 `status.name`)을 읽어 클라이언트 사이드에서 비교한다. 타입 감지·분기 로직 자체를 제거했다.
- **검토한 대안**: 계획서 원안대로 데이터소스 스키마를 먼저 조회해 `상태` 프로퍼티 타입을 감지하고 select/status 필터를 분기.
- **근거**: 타입 감지를 위한 추가 API 호출(`dataSources.retrieve`)과 분기 로직을 없애는 대신 얻는 이득(수십~백여 개 수준 페이지에서 무시할 만한 조회 비용 증가) 대비 코드가 훨씬 단순해지고, select 외의 프로퍼티 타입이 와도 자동으로 대응 가능해 더 견고하다. "심플리시티 우선" 원칙에 따른 의도적 스코프 축소.

---

## D-011: Notion 페이지네이션은 SDK의 `collectPaginatedAPI` 대신 수동 `has_more`/`next_cursor` 루프

- **배경**: `@notionhq/client`는 `collectPaginatedAPI(listFn, args)` 제네릭 헬퍼를 제공해 페이지네이션 루프를 대신 처리해준다. 처음에는 `notion.blocks.children.list`/`notion.dataSources.query`에 이 헬퍼를 적용해 코드를 줄이려 했다.
- **결정**: 수동 `do...while(cursor)` 루프로 구현.
- **검토한 대안**: `collectPaginatedAPI` 사용.
- **근거**: v5.23.0 기준 `ListBlockChildrenParameters`/`QueryDataSourceParameters`의 `start_cursor` 필드가 `string | null | undefined`인 반면, `collectPaginatedAPI`의 제네릭 제약 `PaginatedArgs`는 `string | undefined`만 허용해 `strict` 모드에서 타입 에러가 발생했다(SDK 자체의 타입 선언 불일치). 제네릭 타입 인자를 억지로 맞추기보다 원래 계획서가 요구한 수동 루프를 그대로 구현하는 편이 더 간단하고 타입 안전했다.

---

## D-012: 페이지네이션 응답의 `has_more=true` + `next_cursor=null` 이상 상태는 조용히 종료하지 않고 에러로 실패

- **배경**: [Phase 1 코드 리뷰](reviews/2026-07-09-phase1-code-review.md) #1(Copilot 단독 발견)에서 `blockParser.ts`/`databaseFetcher.ts`의 `cursor = response.has_more ? response.next_cursor ?? undefined : undefined` 패턴이, `has_more:true`인데 `next_cursor:null`인 비정상 응답을 만나면 `cursor`가 `undefined`가 되어 루프가 "정상 종료"로 오인된다는 지적을 받았다. SDK 타입 선언(`next_cursor: string | null`)도 이 상태를 명시적으로 허용한다.
- **결정**: 두 루프 모두 `has_more && !next_cursor`일 때 즉시 `Error`를 던지도록 방어 가드를 추가.
- **검토한 대안**: 기존처럼 조용히 종료, 혹은 경고만 남기고 계속 진행.
- **근거**: 블록/페이지가 누락된 채로 목서버가 "정상 기동 완료"처럼 보이는 것이 가장 나쁜 실패 모드다. 조용한 데이터 손실보다 즉각적인 실패가 디버깅과 신뢰성 면에서 낫다.

---

## D-013: 유효하지 않은 JSON 응답 예시는 경고 후 원문을 서빙하지 않고 빈 객체로 대체

- **배경**: [Phase 1 코드 리뷰](reviews/2026-07-09-phase1-code-review.md) #2(Claude 3개 앵글 독립 지적)에서 `responseJsonExtractor.ts`가 `JSON.parse` 실패 시에도 경고만 남기고 원문을 그대로 성공 응답으로 사용해, `Content-Type: application/json` 헤더와 함께 문법적으로 깨진 body가 서빙될 수 있다는 점을 지적받았다. 형제 모듈 `propertyExtractor.ts`는 동일 성격의 검증 실패를 `{ ok: false, reason }`으로 명확히 스킵시키는데 이 모듈만 예외적으로 관대했다. 이는 리뷰 문서의 Open Question(정책 미확정)이기도 했다.
- **결정**: `JSON.parse` 실패 시 경고 후 빈 객체(`{}`, `hasBody: false`)로 대체하도록 변경 — `propertyExtractor.ts`와 동일한 "검증 실패 시 안전한 기본값" 정책으로 통일.
- **검토한 대안**: 기존처럼 경고만 남기고 원문 그대로 서빙(문서 그대로 반영한다는 D-003의 취지를 문자 그대로 따르는 관점도 있었으나, 문법 오류까지 그대로 서빙하는 것은 취지를 넘어선다고 판단).
- **근거**: 프론트엔드 개발자 입장에서 "빈 객체가 온다"보다 "200 OK + `application/json`인데 `response.json()`이 예외를 던진다"가 훨씬 디버깅하기 어려운 실패 모드다.

---

## D-014: 예외 상황 섹션 탐색을 `__children`까지 재귀하도록 방어적으로 확장 (실 DB엔 현재 영향 없음 확인)

- **배경**: [Phase 1 코드 리뷰](reviews/2026-07-09-phase1-code-review.md) #3에서 `errorCaseParser.ts`가 `responseJsonExtractor.ts`의 `collectCodeBlocks`와 달리 최상위 블록만 스캔해, "예외 상황" 텍스트나 그 이후 테이블이 toggle/column_list 등에 중첩되면 놓칠 수 있다는 비대칭을 지적받았다. 리뷰 자체는 실제 이런 중첩 사례가 있는지 미확인 상태로 Open Question으로 남겨뒀다. 이후 실 DB(`DB_URL`) 120페이지를 전수 스크립트로 조회해 대조한 결과, **현재 이 DB에서는 "예외 상황" 텍스트와 테이블이 단 한 건의 예외도 없이 항상 최상위 형제 블록에 위치**함을 확인했다(중첩 발견 0건). 재귀/비재귀 결과가 갈린 7개 페이지도 전부 응답코드 셀에 선행 정수가 없어 정상적으로 skip된 것이었지, 중첩과는 무관했다.
- **결정**: 실사용 영향이 0건으로 확인됐음에도, `responseJsonExtractor.ts`와 동일하게 `__children`까지 재귀하는 `flattenBlocks`로 변경.
- **검토한 대안**: 실 데이터에 영향이 없으므로 수정하지 않고 "알려진 비대칭, 실사용 영향 없음"으로만 기록.
- **근거**: 이 프로젝트는 Phase 0에서 스펙 문서의 프로퍼티 타입 가정 3건이 실 데이터와 달랐던 전례가 있어(`docs/IMPLEMENTATION_PLAN.md` Phase 0 검증 결과 참고), 페이지 구조 가정에 보수적으로 접근하는 편이 안전하다고 판단했다. 재귀 로직 자체가 이미 `responseJsonExtractor.ts`에 구현돼 있어 추가 비용도 거의 없었다.
