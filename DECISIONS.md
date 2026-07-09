# 기술적 의사결정 로그 (Decision Log)

> 이 문서는 "무엇을 선택했고 왜인가"를 기록한다. 포기한 것에 대한 근거는 [TRADEOFFS.md](TRADEOFFS.md), AI와 실제로 협업한 과정은 [AI_COLLABORATION_LOG.md](AI_COLLABORATION_LOG.md)를 참고.
> 각 항목은 ADR(Architecture Decision Record) 형식: 배경 → 결정 → 검토한 대안 → 근거.

---

## D-001: Java가 아니라 Node.js/TypeScript

- **배경**: 개발자 본인의 주력 스택은 Java/Spring Boot. 처음엔 그 스택으로 설계했다.
- **결정**: Node.js + TypeScript로 전환.
- **검토한 대안**: Java/Spring Boot (원래 계획).
- **근거**: 이 도구의 실사용자는 목서버를 직접 실행하는 **프론트엔드 개발자**다. JVM 설치가 필요 없고 `npx` 한 줄로 실행 가능한 쪽이 실행 환경 허들을 만들지 않는다. "내가 잘 아는 스택"이 아니라 "실사용자에게 마찰이 적은 스택"을 기준으로 판단했다. (근거: [notion-mockserver-spec.md](notion-mockserver-spec.md) 1.4절)

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
