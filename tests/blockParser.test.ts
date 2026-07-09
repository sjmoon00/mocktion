import { describe, expect, it, vi } from 'vitest';
import type { Client } from '@notionhq/client';
import { fetchBlockTree } from '../src/notion/blockParser';

function fakeBlock(id: string) {
  return {
    object: 'block',
    id,
    type: 'paragraph',
    has_children: false,
    paragraph: { rich_text: [] },
  };
}

describe('fetchBlockTree', () => {
  it('has_more=true인데 next_cursor가 없으면 에러를 던진다', async () => {
    const list = vi.fn().mockResolvedValue({
      results: [fakeBlock('b1')],
      has_more: true,
      next_cursor: null,
    });
    const notion = { blocks: { children: { list } } } as unknown as Client;

    await expect(fetchBlockTree(notion, 'page-1')).rejects.toThrow(/비정상/);
  });

  it('has_more/next_cursor로 정상 페이지네이션하며 모든 블록을 수집한다', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ results: [fakeBlock('b1')], has_more: true, next_cursor: 'cursor-1' })
      .mockResolvedValueOnce({ results: [fakeBlock('b2')], has_more: false, next_cursor: null });
    const notion = { blocks: { children: { list } } } as unknown as Client;

    const blocks = await fetchBlockTree(notion, 'page-1');

    expect(blocks.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(list).toHaveBeenCalledTimes(2);
  });
});
