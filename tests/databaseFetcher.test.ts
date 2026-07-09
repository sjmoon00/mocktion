import { describe, expect, it, vi } from 'vitest';
import type { Client } from '@notionhq/client';
import { fetchPages, parseDatabaseId } from '../src/notion/databaseFetcher';

function fakePage(id: string) {
  return {
    object: 'page',
    id,
    url: `https://notion.so/${id}`,
    properties: {},
  };
}

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

describe('fetchPages', () => {
  it('has_more=true인데 next_cursor가 없으면 에러를 던진다', async () => {
    const query = vi.fn().mockResolvedValue({
      results: [fakePage('p1')],
      has_more: true,
      next_cursor: null,
    });
    const notion = { dataSources: { query } } as unknown as Client;

    await expect(fetchPages(notion, 'data-source-1')).rejects.toThrow(/비정상/);
  });

  it('has_more/next_cursor로 정상 페이지네이션하며 모든 페이지를 수집한다', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ results: [fakePage('p1')], has_more: true, next_cursor: 'cursor-1' })
      .mockResolvedValueOnce({ results: [fakePage('p2')], has_more: false, next_cursor: null });
    const notion = { dataSources: { query } } as unknown as Client;

    const result = await fetchPages(notion, 'data-source-1');

    expect(result.pages.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
