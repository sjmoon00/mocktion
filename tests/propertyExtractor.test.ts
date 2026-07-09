import { describe, expect, it } from 'vitest';
import { extractProperties } from '../src/notion/propertyExtractor';

function titleProp(text: string) {
  return { type: 'title', title: [{ plain_text: text }] };
}
function richTextProp(text: string) {
  return { type: 'rich_text', rich_text: [{ plain_text: text }] };
}
function multiSelectProp(names: string[]) {
  return { type: 'multi_select', multi_select: names.map((name) => ({ name })) };
}

describe('extractProperties', () => {
  it('multi_select 1개 / rich_text URI / title 표시명을 정상 추출한다', () => {
    const result = extractProperties({
      'HTTP Method': multiSelectProp(['GET']),
      URI: richTextProp('/contests/{contestId}'),
      응답코드: multiSelectProp(['200']),
      기능명: titleProp('대회 목록 조회'),
    });

    expect(result).toEqual({
      ok: true,
      value: {
        method: 'GET',
        uriPattern: '/contests/{contestId}',
        successStatusCode: 200,
        displayName: '대회 목록 조회',
      },
    });
  });

  it('multi_select 값이 0개(HTTP Method)면 스킵 결과를 반환한다', () => {
    const result = extractProperties({
      'HTTP Method': multiSelectProp([]),
      URI: richTextProp('/x'),
      응답코드: multiSelectProp(['200']),
      기능명: titleProp('x'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/HTTP Method/);
      expect(result.displayName).toBe('x');
    }
  });

  it('multi_select 값이 0개(응답코드)면 스킵 결과를 반환한다', () => {
    const result = extractProperties({
      'HTTP Method': multiSelectProp(['GET']),
      URI: richTextProp('/x'),
      응답코드: multiSelectProp([]),
      기능명: titleProp('x'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/응답코드/);
    }
  });

  it('multi_select 값이 2개 이상이면 경고 후 첫 번째 값을 사용한다', () => {
    const result = extractProperties({
      'HTTP Method': multiSelectProp(['GET', 'POST']),
      URI: richTextProp('/x'),
      응답코드: multiSelectProp(['200', '201']),
      기능명: titleProp('x'),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.method).toBe('GET');
      expect(result.value.successStatusCode).toBe(200);
    }
  });

  it('URI(rich_text)가 비어있으면 스킵 결과를 반환한다', () => {
    const result = extractProperties({
      'HTTP Method': multiSelectProp(['GET']),
      URI: richTextProp(''),
      응답코드: multiSelectProp(['200']),
      기능명: titleProp('x'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/URI/);
    }
  });

  it('title 프로퍼티가 없으면 표시명을 "(제목 없음)"으로 대체한다', () => {
    const result = extractProperties({
      'HTTP Method': multiSelectProp([]),
      URI: richTextProp('/x'),
      응답코드: multiSelectProp(['200']),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.displayName).toBe('(제목 없음)');
    }
  });
});
