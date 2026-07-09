import { describe, expect, it } from 'vitest';
import { parseDatabaseId } from '../src/notion/databaseFetcher';

describe('parseDatabaseId', () => {
  it('URL 경로의 32자리 hex(하이픈 없음)에서 database_id를 추출한다', () => {
    const url =
      'https://www.notion.so/myworkspace/API-Spec-DB-1234567890abcdef1234567890abcdef?v=abcdef1234567890abcdef1234567890';
    expect(parseDatabaseId(url)).toBe('12345678-90ab-cdef-1234-567890abcdef');
  });

  it('이미 하이픈이 포함된 database_id는 그대로 사용한다', () => {
    const id = '12345678-90ab-cdef-1234-567890abcdef';
    expect(parseDatabaseId(id)).toBe(id);
  });

  it('하이픈 없는 32자리 hex ID만 주어져도 추출한다', () => {
    const id = '1234567890abcdef1234567890abcdef';
    expect(parseDatabaseId(id)).toBe('12345678-90ab-cdef-1234-567890abcdef');
  });

  it('database_id를 추출할 수 없으면 명확한 에러를 던진다', () => {
    expect(() => parseDatabaseId('https://example.com/not-a-notion-url')).toThrow(
      /database_id를 추출할 수 없습니다/
    );
  });
});
