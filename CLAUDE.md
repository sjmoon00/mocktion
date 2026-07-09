# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## 프로젝트 컨텍스트: Notion Mock Server CLI

Notion API 명세 DB URL로 로컬 목서버를 즉시 실행하는 CLI 도구(TypeScript + Commander + Express + `@notionhq/client`). **이 프로젝트는 결과물뿐 아니라 AI(Claude Code)와 협업해 개발하는 과정 자체가 포트폴리오 목표다.**

### 참고 문서 (읽는 순서)
1. `notion-mockserver-spec.md` — 전체 기획서, 최초 설계 근거
2. `docs/IMPLEMENTATION_PLAN.md` — Phase별 구현 계획과 진행 체크리스트 (실행의 단일 진실 공급원)
3. `docs/DECISIONS.md` — 기술적 의사결정 로그 (왜 이걸 선택했는가)
4. `docs/TRADEOFFS.md` — 스코프 트레이드오프 (왜 이건 하지 않았는가)
5. `docs/AI_COLLABORATION_LOG.md` — 세션별 AI 협업 과정 시간순 기록

### 작업 시 반드시 지킬 것

- **문서 갱신은 작업의 일부다, 선택이 아니다.** 새 기술적 결정을 내리면 `docs/DECISIONS.md`에 번호를 이어(D-00X) 추가하고, 스코프를 의도적으로 제외하면 `docs/TRADEOFFS.md`에 추가한다(T-00X). 세션 중 의미 있는 진행이 있었다면 끝나기 전에 `docs/AI_COLLABORATION_LOG.md`에 이번 세션 항목을 남긴다 — 무엇을 물었고, AI가 무엇을 했거나 놓쳤고, 사람이 어디서 판단을 개입시켰는지.
- `docs/IMPLEMENTATION_PLAN.md`의 체크박스는 실제 구현 상태와 항상 일치시킨다 — 완료된 항목은 즉시 `[x]`로.
- **모듈 시스템은 CommonJS + `moduleResolution: NodeNext`로 고정** (`@notionhq/client`가 CJS 기반이라 ESM 전환으로 얻는 이득이 없음 — 근거: `docs/DECISIONS.md` D-005). 임의로 `package.json`에 `"type": "module"`을 추가하지 않는다.
- 파서 모듈(`src/notion/*`)은 Notion API 호출부와 순수 파싱 로직을 분리한다 — 파싱 함수는 블록/프로퍼티 JSON을 인자로 받아 `tests/fixtures/*.json` 기반 테스트가 가능해야 한다.
- 이 프로젝트는 **실 Notion DB로 검증 가능한 상태**다(`.env`에 `NOTION_TOKEN`, `DB_URL` 설정됨). 파서 관련 가정은 스펙 문서만 보고 판단하지 말고, 가능하면 실 데이터(fixture 또는 실 DB 재조회)로 확인한다 — Phase 0에서 스펙 문서의 프로퍼티 타입 가정 3건(Method/응답코드가 select 아닌 multi_select, URI가 title 아닌 rich_text, "예외 상황"이 paragraph 아닌 bulleted_list_item)이 실 데이터와 달랐던 전례가 있다.
- 여러 파일에 걸친 작업(Phase 단위 등)은 구현을 시작하기 전에 커밋 단위까지 포함한 계획을 먼저 세운다 — 아래 "구현 계획과 커밋 단위" 참고. 구현부터 끝내놓고 마지막에 커밋을 잘라내는 방식은 지양한다.

### 구현 계획과 커밋 단위

여러 파일/모듈에 걸친 작업을 시작하기 전에, 작업을 논리적 단위(보통 모듈 1개 + 그 테스트)로 나눈 구현 계획을 세운다. 이 계획에는 다음이 포함되어야 한다.

- 각 단위가 무엇을 하는지, 어떤 파일이 포함되는지.
- 단위 간 의존성 순서 — 뒤 단위가 앞 단위의 타입/함수를 참조한다면, 앞 단위를 먼저 커밋해 각 커밋 시점에서 빌드가 깨지지 않게 한다.
- 각 단위의 커밋 메시지 초안(아래 컨벤션에 맞춰).

계획을 사용자에게 제시하고 승인(또는 구현 진행 지시)을 받으면, 그 계획에 명시된 커밋 경계는 이미 승인된 것으로 보고 각 단위가 완성되고 검증(빌드/테스트 통과)되는 즉시 그 자리에서 커밋한다 — 전체 구현이 끝난 뒤 되돌아가서 커밋을 쪼개지 않는다. 계획에 없던 범위로 커밋하거나(예: 문서 갱신을 별도 계획 없이 임의로 끼워 넣는 것), 계획에 없던 시점에 커밋하는 것은 여전히 사용자 확인이 필요하다.

### 커밋 메시지 컨벤션

Angular 컨벤션을 따르되 간소화한다.
- 형식: `<type>(<scope>): <subject>` — subject는 한국어, 명령형, 한 줄로 간결하게.
- type: `feat` `fix` `docs` `refactor` `test` `chore` `build` 중 하나.
- scope는 선택 사항 — 애매하면 생략(`<type>: <subject>`).
- body/footer는 배경 설명이 꼭 필요할 때만 짧게 붙인다. `BREAKING CHANGE` 각주, 커밋별 exhaustive diff 나열 등 무거운 규칙은 따르지 않는다.
