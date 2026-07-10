# notion-mockserver

Notion에 작성된 API 명세 데이터베이스의 URL 하나만으로, 성공/에러 응답을 모두 반영한 로컬 목서버를 즉시 실행하는 CLI 도구입니다.

백엔드가 Notion에 먼저 작성한 API 명세를 프론트엔드가 OpenAPI로 다시 옮기는 이중 작업 없이, Notion 페이지를 그대로 읽어 목서버를 띄웁니다. AI로 mock 데이터를 생성하지 않고, Notion에 이미 작성된 JSON 예시를 있는 그대로 서빙하는 것이 핵심 원칙입니다 (근거: [docs/DECISIONS.md](docs/DECISIONS.md) D-003).

## 설치

```bash
git clone <this repo>
cd notion-mockserver
npm install
```

Node.js 20 이상이 필요합니다.

## Notion 토큰 발급

`.env.example`을 복사해 `.env`를 만들고 `NOTION_TOKEN`을 채웁니다.

```bash
cp .env.example .env
```

토큰은 두 가지 방식으로 발급할 수 있습니다.

- **Personal Access Token(PAT) — 권장**: 발급자 본인이 Notion에서 열람 가능한 모든 페이지(같은 워크스페이스 팀원이 만든 페이지 포함)를 별도 공유 설정 없이 바로 읽을 수 있습니다. 여러 팀원이 작성한 API 명세를 한 워크스페이스에서 같이 보는 이 도구의 실사용 시나리오에 적합합니다. 단, 발급 시 만료 기한(7일~1년)을 선택해야 하므로 만료되면 재발급이 필요합니다.
- **Internal Integration**: 워크스페이스에 연결을 추가한 뒤, 읽고 싶은 데이터베이스마다 `•••` 메뉴 → "Add connections"로 개별 연결해야 합니다. 대상 워크스페이스에서 게스트 신분이라 PAT/Internal Integration을 직접 만들 수 없다면, 워크스페이스의 정식 멤버에게 Internal Integration을 만들어 대상 DB에 연결해달라고 요청하는 것이 이 경우에는 더 적합합니다(PAT보다 노출 범위가 좁고 만료가 없음).

## Notion DB 템플릿 요구사항

이 도구가 읽는 데이터베이스는 다음 프로퍼티를 정확히 이 이름으로 가지고 있어야 합니다.

| 프로퍼티 이름 | Notion 타입 | 설명 | 필수 |
|---|---|---|---|
| `HTTP Method` | Multi-select | GET / POST / PUT / PATCH / DELETE (첫 번째 값 사용) | ✅ |
| `URI` | Rich text | `/contests/{contestId}/submissions/{submissionId}` | ✅ |
| `응답코드` | Multi-select | 200, 201, 204 등 정상 응답 코드 (첫 번째 값 사용) | ✅ |
| (Title 프로퍼티) | Title | 콘솔 로그 표시용 API 이름. 프로퍼티 이름은 자유(예: `기능명`) | 권장 |
| `상태` | Status 또는 Select | 논의필요 / 진행중 / 완료 등, `--status` 필터링용 | 선택 |

페이지 본문은 heading 위치나 code 블록의 language 태그에 의존하지 않고, 모든 `code` 블록을 스캔해 첫 줄 패턴으로 요청/응답 예시를 구분합니다.

- `HTTP/1.1 200 OK` 또는 `{`/`[`로 시작하는 code 블록 → 응답 예시로 사용
- `POST /path/...`처럼 메서드로 시작하는 code 블록 → 요청 예시로 간주해 무시
- 응답코드가 204면 code 블록 유무와 무관하게 본문 없음으로 처리
- 응답 예시가 없으면 빈 객체 `{}`로 등록 (콘솔에 경고 표시)

에러 케이스는 "예외 상황" 문자열이 포함된 블록 다음에 나오는 첫 번째 테이블을 `상황 | 응답코드 | 메시지` 3열 구조로 파싱합니다. Path Parameter / Request Body 테이블은 파싱하지 않습니다 — 목서버가 요청 내용을 검증하지 않으므로 필요하지 않습니다.

## 사용법

```bash
# 개발 중 실행
npm run dev -- --db {Notion DB URL 또는 ID}

# 상태값으로 필터링
npm run dev -- --db {url} --status 완료

# 포트 지정 (기본값 8080)
npm run dev -- --db {url} --status 완료 --port 9090

# 빌드 후 직접 실행
npm run build
node dist/index.js --db {url} --status 완료
```

| 옵션 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `--db` | ✅ | - | Notion 데이터베이스 URL 또는 ID |
| `--status` | ❌ | 없음(전체) | 포함할 상태값 |
| `--port` | ❌ | 8080 | 목서버 실행 포트 |

### 실행 예시 출력

```
[notion-mock] Notion DB 연결 중...
[notion-mock] 총 120개 페이지 발견
[notion-mock] 상태 필터("완료") 적용 → 108개 처리, 12개 스킵

⚠️  스킵된 페이지:
  - 제출물 상세 조회 (상태: 논의필요)
  ...

[notion-mock] 파싱 중...
⚠️  유효하지 않은 JSON입니다. 빈 객체로 대체합니다.

[notion-mock] 목서버 실행 완료 🚀
  → http://localhost:8080
  → 등록된 엔드포인트: 108개
  → 에러 케이스: 320개

등록된 엔드포인트 목록:
  GET    /contests/{contestId}/submissions/{submissionId}  →  200
    └─ 404 (존재하지 않는 대회): Contest not found
  ...
```

CORS는 전역 허용되어 브라우저에서 `fetch()`로 바로 호출할 수 있습니다. 등록되지 않은 경로로 요청하면 404와 함께 등록된 엔드포인트 목록을 힌트로 반환합니다.

## 알려진 한계

자세한 근거는 [docs/TRADEOFFS.md](docs/TRADEOFFS.md)를 참고하세요.

- Path Parameter / Request Body / Request Header는 파싱하지 않습니다 — 목서버는 요청 내용을 검증하지 않습니다.
- 쿼리 파라미터로 에러 응답을 트리거하는 기능(`?error=404`)은 없습니다. 에러 케이스는 기동 시 콘솔에 목록으로만 출력됩니다.
- 여러 상태값 동시 필터(`--status 완료,검토`)는 지원하지 않습니다.
- 멀티 데이터소스 Notion DB는 지원하지 않습니다(단일 데이터소스만 지원, 실행 시 명확한 에러로 안내).
- 요청 예시 JSON이 페이지에서 독립된 code 블록으로 분리되어 있으면 응답으로 오분류될 수 있습니다.
- 응답 예시 code 블록이 여러 개면 첫 번째만 사용합니다(콘솔 경고).
- Request Body 검증, 변경 감지 자동 리로드, 웹 UI, 클라우드 배포는 스코프 밖입니다.

## 관련 문서

이 프로젝트는 결과물뿐 아니라 AI(Claude Code)와 협업해 개발하는 과정 자체를 기록으로 남깁니다.

- [notion-mockserver-spec.md](notion-mockserver-spec.md) — 전체 기획서
- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — Phase별 구현 계획과 진행 현황
- [docs/DECISIONS.md](docs/DECISIONS.md) — 기술적 의사결정 로그
- [docs/TRADEOFFS.md](docs/TRADEOFFS.md) — 스코프 트레이드오프 기록
- [docs/AI_COLLABORATION_LOG.md](docs/AI_COLLABORATION_LOG.md) — 세션별 AI 협업 과정 기록
