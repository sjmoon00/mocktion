import { describe, expect, it, vi } from 'vitest';
import type { Client, PageObjectResponse } from '@notionhq/client';
import { fetchPages, filterPagesByStatus, parseDatabaseId } from '../src/notion/databaseFetcher';

function fakePage(id: string) {
  return {
    object: 'page',
    id,
    url: `https://notion.so/${id}`,
    properties: {},
  };
}

function fakePageWithStatus(
  id: string,
  status: { type: 'status' | 'select'; name: string } | undefined,
  titleText = '제목'
): PageObjectResponse {
  return {
    object: 'page',
    id,
    url: `https://notion.so/${id}`,
    properties: {
      ...(status ? { 상태: { type: status.type, [status.type]: { name: status.name } } } : {}),
      기능명: { type: 'title', title: [{ plain_text: titleText }] },
    },
  } as unknown as PageObjectResponse;
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

describe('filterPagesByStatus', () => {
  it('statusFilter가 없으면 전체 페이지를 그대로 반환한다', () => {
    const pages = [fakePageWithStatus('p1', { type: 'status', name: '완료' })];

    const result = filterPagesByStatus(pages, undefined);

    expect(result).toEqual({ pages, skipped: [] });
  });

  it('status 타입 프로퍼티 값이 일치하는 페이지만 남기고 나머지는 스킵 목록에 담는다', () => {
    const pages = [
      fakePageWithStatus('p1', { type: 'status', name: '완료' }, '완료된 API'),
      fakePageWithStatus('p2', { type: 'status', name: '논의필요' }, '논의중 API'),
    ];

    const result = filterPagesByStatus(pages, '완료');

    expect(result.pages.map((p) => p.id)).toEqual(['p1']);
    expect(result.skipped).toEqual([{ displayName: '논의중 API', statusValue: '논의필요' }]);
  });

  it('select 타입 상태 프로퍼티도 동일하게 처리한다', () => {
    const pages = [fakePageWithStatus('p1', { type: 'select', name: '완료' })];

    const result = filterPagesByStatus(pages, '완료');

    expect(result.pages.map((p) => p.id)).toEqual(['p1']);
  });

  it('모든 페이지에 "상태" 프로퍼티가 없으면 경고를 남긴다', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pages = [fakePageWithStatus('p1', undefined), fakePageWithStatus('p2', undefined)];

    filterPagesByStatus(pages, '완료');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("'상태' 프로퍼티를 가진 페이지를 찾을 수 없습니다"));
    warnSpy.mockRestore();
  });
});
