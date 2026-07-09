# Notion Mock Server CLI — 프로젝트 기획서

> **목적**: 이 문서는 Claude Code가 즉시 개발을 시작할 수 있도록 프로젝트의 모든 맥락, 설계 결정, 구현 명세를 담은 단일 참조 문서입니다.

---

## 1. 프로젝트 개요

### 1.1 한 줄 정의
Notion에 작성된 API 명세 데이터베이스 URL을 입력하면, 성공/에러 응답을 모두 처리하는 목서버를 로컬에서 즉시 실행해주는 CLI 도구

### 1.2 해결하는 문제 (Pain Point)
백엔드 개발자는 Notion에 팀이 읽기 좋은 형태(테이블 + 자연어 설명)로 API 명세를 먼저 작성한다.
프론트엔드와 협업하려면 이 명세를 OpenAPI YAML로 다시 옮겨야 기존 목서버 도구를 쓸 수 있다.
결과적으로 **동일한 명세를 두 번 작성하는 이중 작업**이 발생한다.

이 도구는 Notion 명세를 그대로 읽어 목서버를 생성함으로써 그 이중 작업을 제거한다.

### 1.3 핵심 차별점
- 기존 도구(Beeceptor, OpenAPI Generator)는 OpenAPI YAML이 전제 → 이 도구는 **Notion 페이지가 직접 입력**
- AI로 데이터를 "생성"하지 않는다 — Notion에 이미 작성된 JSON 예시를 있는 그대로 사용하는 원칙 (3.3절)
- 명세 작성 → 목서버 실행까지 **명령어 한 줄**로 해결

### 1.4 실행 환경 결정 — 왜 Node.js인가
이 도구의 **실사용자는 프론트엔드 개발자**다 (목서버를 직접 실행해서 자신의 로컬 환경에서 API를 호출하는 쪽).
처음에는 개발자 본인의 주력 스택인 Java/Spring Boot로 설계했으나, 다음 이유로 Node.js/TypeScript로 전환했다.

| 고려사항 | Java | Node.js |
|---|---|---|
| 실행 환경 | JVM 설치 필요 | 프론트 개발자는 보통 이미 설치돼 있음 |
| 배포 경험 | `java -jar` | `npx` 한 줄 |
| 주 사용자 친화도 | 낮음 (백엔드 전용 환경 가정) | 높음 |

**[면접 포인트]** "왜 Java가 아닌 Node.js로 만들었나?"라는 질문에 "주 사용자가 프론트엔드 개발자라서, 실행 환경 허들을 만들지 않는 게 제품으로서 맞다고 판단했다"고 답할 수 있다. 이게 멘토가 요구한 "제품 사이드 사고"의 핵심 사례다.

---

## 2. 기술 스택

| 구분 | 기술 | 선택 이유 |
|---|---|---|
| Language | TypeScript | 타입 안정성, Notion API 응답 구조가 복잡해 타입 정의가 특히 유용 |
| Runtime | Node.js 20+ | |
| CLI 파싱 | Commander.js | Node CLI 생태계 표준, 옵션 정의가 간결 |
| Mock 서버 | Express.js | 동적 라우트 등록이 직관적, 생태계 검증됨 |
| Notion 연동 | `@notionhq/client` (공식 SDK) | 공식 지원, 타입 정의 포함 |
| Build | TypeScript Compiler (tsc) | |
| 배포 형태 | 로컬 실행 (Node 스크립트) | 클라우드 배포 없음. Phase 3에서 npm 패키지화 고려 |

---

## 3. Notion 명세 템플릿 규격

### 3.1 데이터베이스 프로퍼티 (DB 컬럼)
아래는 이 도구가 읽는 Notion 데이터베이스 컬럼 목록과 타입이다.
**프로퍼티 이름은 정확히 일치해야 한다.**

| 프로퍼티 이름 | Notion 타입 | 설명 | 필수 |
|---|---|---|---|
| `HTTP Method` | Select | GET / POST / PUT / PATCH / DELETE | ✅ |
| `URI` | Title | `/contests/{contestId}/submissions/{submissionId}` | ✅ |
| `응답코드` | Select or Number | 200, 201, 204 등 정상 응답 코드 | ✅ |
| `상태` | Select | 논의필요 / 진행중 / 완료 등 (값은 팀마다 다를 수 있음) | 선택적 필터링 용도 |

### 3.2 페이지 본문 구조 — 실제 예시 4개(GET/POST/PUT/DELETE) 검증 결과

> **검증 노트**: 초기 설계는 GET 예시 1개만 보고 "heading 텍스트로 섹션을 구분"하는 방식을 가정했다. 이후 POST(팀원 등록) · PUT/PATCH(정렬 저장) · DELETE(카테고리 삭제) 실제 페이지 3개를 추가로 검토한 결과, 다음 두 가지가 확인됐다.
> 1. **heading 텍스트는 신뢰할 수 없다.** PUT 예시는 `# 3. Response` heading 자체가 없고, 오타(`Reqeust`)도 존재한다.
> 2. **code 블록의 language 태그도 신뢰할 수 없다.** 같은 "요청 예시" 역할인데도 어떤 페이지는 `json`, 어떤 페이지는 `java`, 어떤 페이지는 태그 없음으로 제각각이었다.
>
> 그래서 파서는 heading 위치나 language 태그에 의존하지 않고, **페이지 내 모든 code 블록을 스캔한 뒤 내용 패턴으로 "요청 예시 / 응답 예시"를 구분**하는 방식으로 설계를 변경했다.

```
# {API 이름}                          ← heading_1, 페이지 제목
# 1. API 설명                          ← heading_1, 스킵
# 2. Request (또는 오타 포함 변형)      ← 파서가 무시. Path Parameter/Request Body
                                          테이블은 파싱하지 않는다 (아래 참고)
# 3. Response (헤딩이 없을 수도 있음)   ← 파서는 헤딩이 아니라 code 블록과
                                          "예외 상황" 텍스트를 직접 탐색
  - 예외 상황                         ← paragraph (헤딩일 수도, 아닐 수도 있음)
    | 상황 | 응답코드 | 메시지 |      ← table, 4개 예시 전부 동일한 3열 구조 (유일하게 안정적)
```

**[중요 — Request 섹션은 의도적으로 파싱하지 않는다]** Path Parameter / Request Body / Request Header 테이블은 페이지마다 컬럼 수(3열/4열/5열)와 섹션 이름(`Request Body` vs `Request Fields`)이 다르다. 그런데 목서버는 요청 내용을 검증하지 않으므로 — 즉 이 테이블들이 애초에 필요 없다 — 이 테이블 구조의 불일치는 파서에 아무 영향을 주지 않는다. Path Parameter는 DB의 `URI` 프로퍼티에서 `{변수}` 패턴을 정규식으로 추출하는 것으로 충분하다 (5.2절, 8절 동일).

**code 블록 분류 규칙 (language 태그 무관, 첫 줄 내용으로 판단):**

| 패턴 | 분류 | 처리 |
|---|---|---|
| 첫 줄이 `{METHOD} /경로` 로 시작 (예: `POST /teams/{teamId}/members`) | 요청 예시 | 무시 |
| 첫 줄이 `HTTP/1.1 {코드}` 로 시작 (예: `HTTP/1.1 204 No Content`) | 응답 예시 | 추출 대상 |
| 헤더 라인 없이 `{` 또는 `[`로 바로 시작 | 응답 예시 (JSON 본문) | 추출 대상 |

이 규칙으로 실제 4개 예시를 분류하면: GET의 `HTTP/1.1 200 OK {...}` 블록 → 응답으로 정확히 식별. POST의 `POST /teams/{teamId}/members {...}` 블록 → 요청으로 식별돼 무시. PUT/DELETE의 `PATCH /contests/...`, `DELETE /categories/...` 블록 → 동일하게 요청으로 식별돼 무시.

### 3.3 파싱 우선순위 규칙

실제 예시를 보면 응답 JSON이 명시된 페이지(GET)와 없는 페이지(POST/PUT/DELETE)가 섞여 있었고, 특히 **204는 HTTP 스펙상 항상 본문이 없는 게 정상**이라는 점이 가장 먼저 처리돼야 할 예외였다. 이를 반영해 결정 순서를 다음과 같이 확정한다.

```
성공 응답 결정 순서 (위에서부터 순서대로 적용, 먼저 맞는 조건에서 멈춤):

1순위: 응답코드(DB 프로퍼티) == 204
       → 본문 없음으로 확정. code 블록 파싱하지 않는다.
         (DELETE 예시가 이 케이스 — method와 무관하게 204면 항상 이 규칙 적용)

2순위: 위 3.2절 규칙으로 분류한 "응답 예시" code 블록이 페이지에 존재
       → 그 JSON을 그대로 사용 (method 무관 — GET이든 POST든 동일 로직)

3순위: (JSON 없고, 204도 아님) → 빈 객체 {} 사용
       (실제 4개 예시 중 POST/PUT/DELETE는 응답 본문을 적지 않는 경우가 많았고,
        "본문을 안 적으면 없는 것으로 간주"하는 것이 사용자 확인 사항. method
        구분 없이 동일하게 적용 — GET이라도 JSON 예시가 없으면 빈 객체로 처리한다)

에러 케이스 결정:
"예외 상황" 텍스트가 포함된 paragraph 또는 heading 이후 첫 번째 테이블을
| 상황 | 응답코드 | 메시지 | 컬럼 구조로 파싱 (4개 예시 전부 일관되게 확인된 유일한 안정 구조)
```

**[스코프 결정]** AI를 이용한 mock 데이터 생성(JSON 예시 없는 페이지에 대한 fallback)은 계획에서 제외한다. 실제 검증한 예시 4개 중 이 케이스에 해당하는 페이지가 없었고, 이 프로젝트의 핵심 가치는 "AI로 무언가를 생성한다"가 아니라 "Notion 명세를 그대로 읽어 즉시 쓸 수 있는 목서버를 만든다"는 데 있다. Response Fields 테이블에 실제 JSON 예시가 없는 페이지는 빈 객체로 처리하고, 정확한 mock이 필요하다면 명세 작성자가 Response 섹션에 JSON 예시를 채워 넣는 것으로 해결한다 — 이 편이 파이프라인도 단순하고, 명세 작성 습관도 함께 개선된다.

---

## 4. CLI 인터페이스 명세

### 4.1 사용법
```bash
# 개발 중 실행
npm run start -- --db https://www.notion.so/{workspace}/{database_id}

# 상태 필터링 (지정한 상태값과 일치하는 페이지만 처리)
npm run start -- --db {url} --status 완료

# 포트 지정 (기본값 8080)
npm run start -- --db {url} --status 완료 --port 9090

# 빌드 후 직접 실행
node dist/index.js --db {url} --status 완료
```

> **[Phase 3 이후 고려사항]** `package.json`에 `bin` 필드를 추가하고 npm에 패키지를 공개하면 `npx notion-mock --db {url}` 형태로 실행 가능해진다. 지금 단계의 필수 요건은 아니다.

### 4.2 CLI 옵션 정의
| 옵션 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `--db` | ✅ | - | Notion 데이터베이스 전체 URL 또는 ID |
| `--status` | ❌ | 없음 (전체) | 포함할 상태값. 미지정 시 모든 페이지 처리 |
| `--port` | ❌ | 8080 | 목서버 실행 포트 |

### 4.3 환경변수
```bash
# Notion API 토큰 (필수, 이 프로젝트의 유일한 필수 환경변수)
NOTION_TOKEN=secret_xxxxxxxxxxxx
```

`.env` 파일로 관리하고 `dotenv` 패키지로 로드한다. `.env`는 `.gitignore`에 반드시 포함한다.

### 4.4 실행 결과 출력 예시
```
[notion-mock] Notion DB 연결 중...
[notion-mock] 총 15개 페이지 발견
[notion-mock] 상태 필터("완료") 적용 → 12개 처리, 3개 스킵

⚠️  스킵된 페이지:
  - 회원 탈퇴 API (상태: 논의필요)
  - 소셜 로그인 API (상태: 진행중)
  - 알림 설정 API (상태: 미작성)

[notion-mock] 파싱 중...
  ✅ GET    /contests/{contestId}/submissions/{submissionId}
  ✅ POST   /contests/{contestId}/submissions
  ✅ DELETE /contests/{contestId}/submissions/{submissionId}
  ⚠️  GET    /users/{userId}/profile → JSON 예시 없음, 빈 객체({})로 등록
  ...

[notion-mock] 목서버 실행 완료 🚀
  → http://localhost:8080
  → 등록된 엔드포인트: 12개
  → 에러 케이스: 28개

등록된 엔드포인트 목록:
  GET    /contests/{contestId}/submissions/{submissionId}  →  200
  POST   /contests/{contestId}/submissions                 →  201
  DELETE /contests/{contestId}/submissions/{submissionId} →  204
  ...
```

---

## 5. 시스템 아키텍처

### 5.1 전체 파이프라인
```
CLI 입력 (--db URL, --status, --port)
  ↓
NotionDatabaseFetcher
  - database_id로 data_source_id 조회 (6.1절 참고 — 중요)
  - data_source 쿼리 + 상태 필터 적용
  - 유효 페이지 ID 목록 반환
  ↓
NotionPageParser (페이지별 반복)
  ├─ PropertyExtractor
  │    - HTTP Method (select 프로퍼티)
  │    - URI (title 프로퍼티)
  │    - 응답코드 (select or number 프로퍼티)
  └─ BlockContentParser
       ├─ ResponseJsonExtractor
       │    - Response 섹션 탐색
       │    - json 코드블록 추출
       │    - 없으면 빈 객체 '{}' 사용 (3.3절 3순위, AI 호출 없음)
       └─ ErrorCaseParser
            - 예외 상황 테이블 파싱
            - 상황 | 응답코드 | 메시지 → ErrorCase 객체
  ↓
RouteRegistry
  - EndpointSpec 리스트 → Express 동적 라우트 등록
  - Path Variable 패턴 변환: {contestId} → :contestId
  ↓
MockServer (Express)
  - app.listen(port)로 실행
  - 등록된 라우트로 요청 처리
```

### 5.2 핵심 도메인 타입
```typescript
// src/types/domain.ts

export interface EndpointSpec {
  method: string;                 // "GET", "POST" 등
  uriPattern: string;             // "/contests/{contestId}/submissions/{submissionId}"
  successStatusCode: number;      // 200, 201, 204 등
  hasBody: boolean;               // false면 204이거나 "문서화된 본문 없음" (3.3절 1순위/3순위)
  successResponseJson: string;    // hasBody가 true일 때만 의미 있음. false면 '{}' 또는 무시
  errorCases: ErrorCase[];
}

export interface ErrorCase {
  statusCode: number;             // 404, 403 등
  message: string;                // "Contest not found"
  situation: string;              // "존재하지 않는 대회" (로그 출력용)
}

export interface ResponseFieldRow {
  name: string;
  description: string;
  type: string;
  extra: string;
}
```

### 5.3 목서버 요청 처리 로직
```
요청 수신 예시 1: GET /contests/1/submissions/12

1. URI 패턴 매칭: /contests/:contestId/submissions/:submissionId와 일치 확인
2. Method 일치 확인: GET
3. hasBody == true → HTTP 200 + successResponseJson 반환

요청 수신 예시 2: POST /teams/1/members (응답 본문이 문서화되지 않은 쓰기 작업)

1. URI 패턴 매칭, Method 일치 확인
2. hasBody == false, successStatusCode == 201 (204 아님)
   → HTTP 201 + 빈 객체 '{}' 반환 (3.3절 3순위 — 프론트의 response.json() 파싱이
     깨지지 않도록 진짜 빈 본문 대신 빈 JSON 객체를 보낸다)

요청 수신 예시 3: DELETE /categories/1 (204 No Content)

1. URI 패턴 매칭, Method 일치 확인
2. successStatusCode == 204
   → HTTP 204, 본문 전송 안 함 (HTTP 스펙 준수 — Content-Type 헤더도 생략)

에러 응답 시뮬레이션:
- 현재 Phase 1에서는 성공 응답만 자동 반환
- 에러 케이스는 목서버 기동 시 콘솔에 목록 출력 (프론트가 참고용으로 확인)
- 향후 Phase 2: 특정 쿼리 파라미터(?error=404)로 에러 응답 트리거 예정
```

**[중요 설계 결정 1]** 동일 URI에 여러 에러 케이스(예: 404가 2개)가 있을 경우, 현재는 첫 번째 에러 케이스를 기본값으로 사용한다. 쿼리 파라미터 기반 분기는 Phase 2에서 구현한다.

**[중요 설계 결정 2]** 204와 "본문 미문서화"는 둘 다 `hasBody: false`로 같은 타입을 쓰지만 핸들러 동작은 다르다 — 204는 진짜 빈 본문(HTTP 스펙 요구사항), 나머지는 `{}`(프론트 파싱 안정성을 위한 선택). 8절 구현 가이드에서 이 둘을 분기한다.

---

## 6. Notion API 연동 명세

### 6.1 ⚠️ 중요 — Database / Data Source 구조 (2025-09-03 API 변경사항)

Notion은 2025년 9월 API 버전 `2025-09-03`부터 데이터 모델을 변경했다.
**Database는 이제 1개 이상의 Data Source를 담는 컨테이너이고, 실제 페이지 목록 조회는 Data Source 단위로 이루어진다.**

```
이전 (2022-06-28):  Database ──직접── Pages
현재 (2025-09-03):  Database ──containers── Data Source ──has── Pages
```

영향받는 부분:
- 기존: `POST /v1/databases/{database_id}/query`
- 변경: `POST /v1/data_sources/{data_source_id}/query`

이 프로젝트는 **단일 데이터소스 데이터베이스만 지원**한다 (사용자가 직접 만든 일반적인 Notion DB는 대부분 이 경우에 해당). 멀티 데이터소스 DB는 스코프 밖이다 (11절 참고).

**구현 패턴 (discovery → query):**
```typescript
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// 1단계: database_id로 data_source_id 조회
const database = await notion.databases.retrieve({ database_id: databaseId });
const dataSourceId = (database as any).data_sources?.[0]?.id;

if (!dataSourceId) {
  throw new Error(
    '데이터소스 ID를 찾을 수 없습니다. Notion-Version 헤더 또는 SDK 버전을 확인하세요.'
  );
}

// 2단계: data_source_id로 페이지 목록 쿼리
const response = await notion.request({
  method: 'post',
  path: `data_sources/${dataSourceId}/query`,
  body: statusFilter
    ? { filter: { property: '상태', select: { equals: statusFilter } } }
    : {},
});
```

> **[구현 시 재확인 필수]** 이 변경은 2025년 9월에 도입되어 비교적 최근이다. `@notionhq/client`의 최신 버전에서는 위 예시의 `notion.request(...)` raw 호출 대신 `notion.dataSources.query(...)` 같은 전용 메서드가 정식 제공될 수 있다. 구현 시작 전 반드시 https://developers.notion.com/reference/changes-by-version 와 `@notionhq/client` 패키지의 최신 README를 확인할 것. 위 `notion.request()` 패턴은 SDK 버전에 관계없이 동작하는 안전한 대안이다.

### 6.2 인증

```
Authorization: Bearer {NOTION_TOKEN}  (SDK가 자동 처리)
```

**[중요 — 토큰 생성 방식 선택]** Notion 토큰은 두 가지 방식으로 만들 수 있고, 어떤 걸 쓰느냐에 따라 팀원이 만든 페이지에 대한 접근 가능 여부가 달라진다.

- **Personal Access Token(PAT) — 권장**: 토큰 생성자가 Notion에서 이미 갖고 있는 열람 권한을 그대로 상속한다. 즉 사용자가 브라우저에서 열어볼 수 있는 페이지라면(같은 워크스페이스의 팀원이 만든 페이지 포함), 별도 공유 설정 없이 API로도 바로 읽힌다. 이 프로젝트의 실사용 시나리오(여러 팀원이 작성한 API 명세를 한 워크스페이스에서 같이 보는 구조)에 적합하다.
- **Internal Integration**: 워크스페이스에 연결을 추가한 뒤, 읽고 싶은 각 데이터베이스/페이지마다 우측 상단 `•••` 메뉴 → "Add connections"로 개별적으로 연결해줘야 한다. 페이지 생성자와 무관하게 편집 권한이 있는 사람이 추가할 수 있지만, 새 명세 페이지가 생길 때마다 이 작업이 반복돼야 한다는 번거로움이 있다.

토큰 발급 방식과 무관하게 `Authorization: Bearer` 헤더 형식과 이후 코드는 동일하다 — 차이는 오직 "Notion 설정에서 어떤 토큰을 발급받는가"에 있다.

**[참고]** PAT는 발급 시 만료 기한(7일/30일/90일/180일/1년)을 선택해야 한다 — Internal Integration 토큰과 달리 무기한이 아니다. 장기간 사용할 계획이라면 README에 "토큰이 만료되면 재발급 필요"라는 안내를 남겨두는 것을 권장한다.

**[참고 — 게스트 신분인 워크스페이스의 경우]** 대상 데이터베이스가 있는 워크스페이스에서 사용자가 게스트(guest) 신분이라면 PAT와 Internal Integration 둘 다 본인이 직접 만들 수 없다 — 두 방식 모두 워크스페이스의 정식 멤버 권한을 요구한다. 이 경우 그 워크스페이스의 정식 멤버에게 **Internal Integration**을 만들어 대상 데이터베이스에만 "Add connections"로 연결한 뒤 시크릿 키를 전달받는 방식을 권장한다(PAT보다 노출 범위가 좁고 만료가 없어 이 시나리오에 더 적합하다). 코드나 환경변수 이름(`NOTION_TOKEN`)은 변경되지 않는다 — 토큰 값의 발급 주체만 달라진다.

### 6.3 데이터소스 쿼리 응답 구조
```json
{
  "results": [
    {
      "id": "page-id-xxxx",
      "properties": {
        "HTTP Method": { "select": { "name": "GET" } },
        "URI": { "title": [{ "plain_text": "/contests/{contestId}/..." }] },
        "응답코드": { "select": { "name": "200" } },
        "상태": { "select": { "name": "완료" } }
      }
    }
  ],
  "has_more": true,
  "next_cursor": "cursor-xxxx"
}
```

**[주의]** 한 번에 최대 100개 결과가 반환된다. `has_more: true`인 경우 `start_cursor`로 반복 호출하여 전체 목록을 수집해야 한다.

### 6.4 페이지 블록 조회
```typescript
const blocks = await notion.blocks.children.list({ block_id: pageId, page_size: 100 });
```

블록 타입별 처리:
```
heading_1  → 페이지 제목/섹션 텍스트이지만 파서는 위치 기준으로 신뢰하지 않음 (3.2절 검증 노트)
table      → 파싱 대상은 "예외 상황" 테이블뿐. Path Parameter/Request Body 테이블은 무시 (3.2절)
code       → 모든 code 블록을 스캔 후 첫 줄 내용으로 요청/응답 분류 (language 태그는 무시, 3.2절 표 참고)
paragraph  → "예외 상황" 텍스트 감지용
```

블록이 `has_children: true`인 경우 children을 재귀적으로 조회해야 한다 (특히 table 블록).
이 블록 API 자체는 2025-09-03 변경의 영향을 받지 않는다.

### 6.5 테이블 블록 파싱
```typescript
const rows = await notion.blocks.children.list({ block_id: tableBlockId });

// table_row 블록 구조
// row.table_row.cells[0][0].plain_text 형태로 각 셀 텍스트 접근
```

첫 번째 row는 헤더로 처리한다.

---

## 7. 목서버 동적 라우트 등록 구현 가이드 (Express)

```typescript
// src/mock/routeRegistry.ts
import express, { Express, Request, Response } from 'express';
import { EndpointSpec } from '../types/domain';

export function createMockServer(specs: EndpointSpec[]): Express {
  const app = express();

  for (const spec of specs) {
    // Notion의 {변수} 표기를 Express의 :변수 표기로 변환 (필수 — 형식이 다름)
    const expressPath = spec.uriPattern.replace(/\{(\w+)\}/g, ':$1');

    const handler = (_req: Request, res: Response) => {
      // 5.3절 [중요 설계 결정 2]: 204는 진짜 빈 본문, 그 외 hasBody=false는 '{}'
      if (spec.successStatusCode === 204) {
        res.status(204).end();
        return;
      }
      res
        .status(spec.successStatusCode)
        .type('application/json')
        .send(spec.hasBody ? spec.successResponseJson : '{}');
    };

    switch (spec.method.toUpperCase()) {
      case 'GET': app.get(expressPath, handler); break;
      case 'POST': app.post(expressPath, handler); break;
      case 'PUT': app.put(expressPath, handler); break;
      case 'PATCH': app.patch(expressPath, handler); break;
      case 'DELETE': app.delete(expressPath, handler); break;
      default:
        console.warn(`⚠️  지원하지 않는 HTTP 메서드 스킵: ${spec.method} ${spec.uriPattern}`);
    }
  }

  return app;
}
```

```typescript
// src/mock/server.ts
import { createMockServer } from './routeRegistry';
import { EndpointSpec } from '../types/domain';

export function startMockServer(specs: EndpointSpec[], port: number): void {
  const app = createMockServer(specs);
  app.listen(port, () => {
    console.log(`\n[notion-mock] 목서버 실행 완료 🚀`);
    console.log(`  → http://localhost:${port}`);
    console.log(`  → 등록된 엔드포인트: ${specs.length}개`);

    console.log(`\n등록된 엔드포인트 목록:`);
    for (const spec of specs) {
      console.log(`  ${spec.method.padEnd(6)} ${spec.uriPattern}  →  ${spec.successStatusCode}`);
      for (const err of spec.errorCases) {
        console.log(`    └─ ${err.statusCode} (${err.situation}): ${err.message}`);
      }
    }
  });
}
```

**[주의]** Express 라우트는 Notion 파싱이 전부 끝난 `EndpointSpec[]`이 준비된 후 한 번에 등록한다. 파싱과 서버 기동을 분리해야 디버깅이 쉽다.

---

## 8. 프로젝트 디렉토리 구조

```
notion-mock/
├── src/
│   ├── index.ts                       # CLI 진입점 (Commander.js 설정 + 전체 흐름 조립)
│   ├── notion/
│   │   ├── notionClient.ts            # @notionhq/client 초기화
│   │   ├── databaseFetcher.ts         # data_source 조회 + 페이지네이션 + 상태 필터
│   │   ├── pageParser.ts              # 페이지 → EndpointSpec 변환 오케스트레이터
│   │   ├── propertyExtractor.ts       # DB 프로퍼티(Method, URI, 응답코드) 추출
│   │   ├── blockParser.ts             # 블록 트리 탐색, 섹션별 분류
│   │   ├── responseJsonExtractor.ts   # json 코드블록 추출
│   │   └── errorCaseParser.ts         # 예외 상황 테이블 파싱
│   ├── mock/
│   │   ├── routeRegistry.ts           # Express 동적 라우트 등록
│   │   └── server.ts                  # 서버 기동 + 콘솔 출력
│   └── types/
│       └── domain.ts                  # EndpointSpec, ErrorCase, ResponseFieldRow
├── .env.example
├── .gitignore                         # .env 포함 필수
├── package.json
├── tsconfig.json
└── README.md
```

### package.json 의존성 (참고)
```json
{
  "dependencies": {
    "commander": "^12.0.0",
    "express": "^4.19.0",
    "@notionhq/client": "latest",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.16.0",
    "@types/node": "^20.0.0",
    "@types/express": "^4.17.0"
  }
}
```
> 버전은 구현 시작 시점에 `npm install`로 최신 버전을 받는 것을 권장. 위 버전은 호환성 참고용 하한선이다.

---

## 9. WBS (Work Breakdown Structure)

### 원칙
- 백엔드 최적화 작업 금지 (지금 단계에서 불필요)
- 기능 동시 개발 금지 (한 태스크 완료 후 다음으로)
- 배포를 마지막으로 미루지 않기 (Phase 1 완료 후 즉시 실행 가능한 상태 유지)

---

### Phase 0: 환경 구성 (1일)

**Task 0-1: 프로젝트 초기화**
- [ ] `npm init` + TypeScript 설정 (`tsconfig.json`)
- [ ] 9절의 의존성 설치
- [ ] `.env.example` 작성, `.gitignore`에 `.env` 추가

**Task 0-2: Notion API 연결 검증 (Data Source 구조 확인 우선)**
- [ ] `notionClient.ts` 작성
- [ ] `notion.databases.retrieve()`로 실제 DB의 `data_sources` 배열 확인 — **이게 먼저 확인되지 않으면 이후 모든 작업이 막힌다**
- [ ] `data_source_id`로 페이지 1개 조회 테스트, raw JSON 콘솔 출력

**Defect Check**: 실제 Notion DB에서 data_source_id를 정상적으로 얻고, 페이지 1개를 콘솔에 출력할 수 있는가?

---

### Phase 1: Notion 파싱 모듈 (4일)

**Task 1-1: DB 페이지 목록 조회**
- [ ] `databaseFetcher.ts`: DB URL에서 database_id 추출
- [ ] data_source_id 조회 → 쿼리 호출
- [ ] 페이지네이션 처리 (`has_more`, `next_cursor` 루프)
- [ ] `--status` 필터 적용 로직
- [ ] 스킵된 페이지 목록 수집 및 경고 출력

**Defect Check**: 15개 페이지 DB에서 상태="완료" 필터 적용 시 정확한 수의 페이지 ID만 반환되는가?

**Task 1-2: DB 프로퍼티 파싱**
- [ ] `propertyExtractor.ts`: properties JSON에서 Method, URI, 응답코드 추출
- [ ] Select 타입, Title 타입, Number 타입 각각 처리
- [ ] 필수 프로퍼티 누락 시 해당 페이지 스킵 + 경고

**Defect Check**: `HTTP Method: GET`, `URI: /contests/{contestId}/...`, `응답코드: 200` 정확히 추출되는가?

**Task 1-3: 페이지 블록 파싱 — 성공 응답 결정 (3.3절 3단계 우선순위 구현)**
- [ ] `blocks.children.list()` 호출 + 재귀 탐색
- [ ] 1순위: `응답코드 == 204`면 즉시 `hasBody: false` 확정, 아래 단계 스킵
- [ ] 페이지 내 모든 `code` 블록 스캔 (`heading_1` 위치나 `language` 태그로 필터링하지 않음 — 3.2절 검증 노트 참고)
- [ ] 코드블록 첫 줄 패턴으로 요청/응답 분류: `{METHOD} /경로` 시작 → 무시, `HTTP/1.1 {코드}` 또는 `{`/`[` 시작 → 응답 후보
- [ ] 2순위: 응답 후보 JSON이 있으면 그대로 사용, `hasBody: true`
- [ ] 3순위: JSON 없으면 `hasBody: false`, 빈 객체 `{}`로 처리 (method 무관, AI 호출 없음)

**Defect Check**: GET 예시(JSON 있음) · POST 예시(JSON 없음, 201) · DELETE 예시(204) 세 가지를 각각 돌렸을 때 3.3절 우선순위대로 정확히 분기되는가?

**Task 1-4: 페이지 블록 파싱 — 에러 케이스 추출**
- [ ] "예외 상황" 문자열이 포함된 블록 이후 첫 번째 `table` 블록 탐색
- [ ] 테이블 헤더를 `상황 | 응답코드 | 메시지` 컬럼으로 인식 (`plain_text` 사용 — 셀 내 **bold** 마크업은 Notion API가 자동으로 분리해 처리하므로 별도 strip 불필요)
- [ ] 각 행을 `ErrorCase` 객체로 변환

**Defect Check**: 팀원 등록(POST) 예시에서 7개 에러 케이스(400×3, 404×1, 409×1, 401×1, 403×1)가 모두 추출되는가?

---

### Phase 2: 목서버 구현 (3일)

**Task 2-1: EndpointSpec 리스트 조립**
- [ ] Phase 1 파싱 결과를 `EndpointSpec[]`으로 수집
- [ ] 중복 엔드포인트(동일 Method + URI) 감지 및 경고

**Task 2-2: Express 동적 라우트 등록**
- [ ] `routeRegistry.ts` 구현 (8절 코드 참조)
- [ ] `{변수}` → `:변수` 패턴 변환 검증

**Task 2-3: 응답 핸들러 구현**
- [ ] 성공 응답: `Content-Type: application/json` + `successResponseJson` 반환
- [ ] 에러 케이스: 현재는 기동 시 콘솔 출력만 (실제 에러 응답 트리거는 Phase 2 이후)

**Task 2-4: 실행 흐름 통합**
- [ ] `index.ts`: Commander 커맨드 → Notion 파싱 → EndpointSpec 조립 → Express 서버 기동
- [ ] `--port` 옵션 → `app.listen(port)` 연결

**Defect Check**: 실제 Notion DB로 CLI 실행 시 목서버가 기동되고, 등록된 엔드포인트에 curl 요청 시 JSON 응답이 오는가?

---

### Phase 3: 마무리 (2일)

**Task 3-1: 엣지 케이스 처리**
- [ ] Notion API rate limit (429) 처리: 재시도 로직
- [ ] 블록 `has_children: true` 재귀 탐색 누락 없는지 검증
- [ ] 잘못된 Notion URL 입력 시 명확한 에러 메시지
- [ ] 멀티 데이터소스 DB인 경우 명확한 에러 메시지로 안내 (지원 범위 아님을 표시)
- [ ] `NOTION_TOKEN` 누락 시 즉시 종료 + 안내 메시지

**Task 3-2: 실행 가능한 형태로 정리**
- [ ] `npm run build` (tsc) 정상 동작 확인
- [ ] README.md 작성: 설치 방법, 환경변수 설정, 사용 예시
- [ ] (선택) `package.json`에 `bin` 필드 추가해 향후 npm 배포 여지 마련

**Task 3-3: 포트폴리오 문서화**
- [ ] AI 활용 과정 기록 (Claude Code로 설계·구현하는 과정 자체를 process artifact로 남김 — 완성된 도구 자체는 AI 기능을 담고 있지 않으므로, "무엇을 만들었는지"와 "어떻게 만들었는지"를 이력서에서 분리해서 서술)
- [ ] 기술적 의사결정 로그 작성 (왜 Node.js? 왜 단일 데이터소스만 지원? 왜 AI mock 생성을 스코프에서 뺐는지)

---

## 10. 현재 스코프에서 제외된 항목 (Phase 2 이후)

| 항목 | 이유 |
|---|---|
| 쿼리 파라미터 기반 에러 응답 트리거 (`?error=404`) | Phase 2 예정 |
| 여러 상태값 동시 필터 (`--status 완료,검토`) | 우선순위 낮음 |
| 멀티 데이터소스 Notion DB 지원 | 일반적이지 않은 케이스, 복잡도 대비 효용 낮음 |
| AI를 이용한 mock 데이터 생성 (JSON 없는 페이지 fallback) | 3.3절 참고 — 제품 자체에 AI 기능을 넣기보다 명세를 있는 그대로 반영하는 단순한 파이프라인을 우선. 실제 검증 예시에서도 필요성이 확인되지 않음 |
| 변경 감지 자동 리로드 | 스코프 초과 |
| 웹 UI 대시보드 | 스코프 초과 |
| 클라우드 배포 | 스코프 초과 (로컬 실행으로 확정) |
| npm 공개 배포 | Phase 3 선택사항, 필수 아님 |
| Request Body 검증 | 목서버 목적에 불필요 |

---

## 11. 성공 기준

### 기능 완성 기준
- [ ] `npm run start -- --db {url}` 한 줄로 목서버가 기동된다
- [ ] 등록된 엔드포인트에 curl로 요청 시 Notion 명세의 JSON 응답이 그대로 반환된다
- [ ] JSON 코드블록이 없는 페이지는 빈 객체(`{}`)로 등록되고, 이 사실이 콘솔에 경고로 표시된다
- [ ] `--status` 옵션으로 특정 상태의 페이지만 필터링된다
- [ ] 스킵된 페이지와 등록된 엔드포인트가 콘솔에 명확히 출력된다

### 포트폴리오 어필 기준
- [ ] "Notion 명세 → 목서버" 파이프라인을 면접에서 1분 안에 설명할 수 있다
- [ ] 기존 도구(Beeceptor, OpenAPI Generator)와의 차이를 알고 있고, 먼저 언급할 수 있다
- [ ] 왜 Java가 아닌 Node.js를 선택했는지, 사용자 중심으로 설명할 수 있다
- [ ] 왜 AI로 mock 데이터를 생성하는 기능을 넣지 않았는지 설명할 수 있다 (제품에 AI를 억지로 넣기보다, Notion 명세를 정확히 반영하는 단순한 파이프라인을 우선했다는 판단)
- [ ] AI로 개발했다는 사실은 제품 기능이 아니라 개발 과정(설계·구현 과정의 process artifact)으로 이력서에서 별도로 설명할 수 있다
- [ ] 스코프 결정 이유(로컬 실행, 에러 트리거 제외, 단일 데이터소스만 지원 등)를 트레이드오프로 설명할 수 있다
