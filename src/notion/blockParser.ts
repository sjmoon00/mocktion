import type { Client } from '@notionhq/client';
import { isFullBlock } from '@notionhq/client';

export interface BlockNode {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

export interface BlockWithChildren extends BlockNode {
  __children?: BlockWithChildren[];
}

export async function fetchBlockTree(notion: Client, blockId: string): Promise<BlockWithChildren[]> {
  const blocks: BlockWithChildren[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor });
    blocks.push(...(response.results.filter(isFullBlock) as BlockWithChildren[]));
    if (response.has_more && !response.next_cursor) {
      throw new Error('Notion API 페이지네이션 응답이 비정상입니다: has_more=true인데 next_cursor가 없습니다.');
    }
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  for (const block of blocks) {
    if (block.has_children) {
      block.__children = await fetchBlockTree(notion, block.id);
    }
  }

  return blocks;
}
