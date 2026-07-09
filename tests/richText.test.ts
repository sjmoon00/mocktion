import { describe, expect, it } from 'vitest';
import { extractTitleText, joinRichText } from '../src/notion/richText';

describe('joinRichText', () => {
  it('여러 rich_text 세그먼트를 하나의 문자열로 병합한다', () => {
    expect(joinRichText([{ plain_text: '안' }, { plain_text: '녕' }])).toBe('안녕');
  });

  it('undefined/null이면 빈 문자열을 반환한다', () => {
    expect(joinRichText(undefined)).toBe('');
    expect(joinRichText(null)).toBe('');
  });
});

describe('extractTitleText', () => {
  it('type이 title인 프로퍼티를 찾아 텍스트를 반환한다', () => {
    const properties = {
      URI: { type: 'rich_text', rich_text: [{ plain_text: '/x' }] },
      기능명: { type: 'title', title: [{ plain_text: '팀원 등록' }] },
    };

    expect(extractTitleText(properties)).toBe('팀원 등록');
  });

  it('title 프로퍼티가 없으면 "(제목 없음)"을 반환한다', () => {
    const properties = { URI: { type: 'rich_text', rich_text: [{ plain_text: '/x' }] } };

    expect(extractTitleText(properties)).toBe('(제목 없음)');
  });

  it('title 프로퍼티는 있지만 값이 비어있으면 "(제목 없음)"을 반환한다', () => {
    const properties = { 기능명: { type: 'title', title: [] } };

    expect(extractTitleText(properties)).toBe('(제목 없음)');
  });
});
