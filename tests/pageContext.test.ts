import { describe, expect, it } from 'vitest';
import { buildPageContext } from '../src/notion/pageContext';

describe('buildPageContext', () => {
  it('pageUrl과 blockId가 모두 있으면 블록 딥링크(대시 제거)를 붙인다', () => {
    const context = buildPageContext('회원가입', 'https://app.notion.com/p/abc123', '예외 상황 표', 'a1b2-c3d4-e5f6');

    expect(context).toBe('회원가입 > 예외 상황 표 (https://app.notion.com/p/abc123#a1b2c3d4e5f6)');
  });

  it('blockId가 없으면 페이지 링크까지만 붙인다', () => {
    const context = buildPageContext('팀원 등록', 'https://app.notion.com/p/def456', 'HTTP Method');

    expect(context).toBe('팀원 등록 > HTTP Method (https://app.notion.com/p/def456)');
  });

  it('pageUrl이 없으면 링크 없이 텍스트만 반환한다', () => {
    const context = buildPageContext('로그인', '', '응답 예시 code 블록', 'block-id');

    expect(context).toBe('로그인 > 응답 예시 code 블록');
  });
});
