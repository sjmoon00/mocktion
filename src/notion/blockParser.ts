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
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  for (const block of blocks) {
    if (block.has_children) {
      block.__children = await fetchBlockTree(notion, block.id);
    }
  }

  return blocks;
}
