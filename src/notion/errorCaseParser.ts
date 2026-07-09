import type { ErrorCase } from '../types/domain';
import type { BlockNode } from './blockParser';
import { joinRichText } from './richText';

export function extractErrorCases(blocks: BlockNode[]): ErrorCase[] {
  const startIndex = blocks.findIndex((block) => getBlockText(block).includes('예외 상황'));
  if (startIndex === -1) return [];

  for (let i = startIndex + 1; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === 'table') {
      return parseErrorTable(block);
    }
  }

  return [];
}

function getBlockText(block: BlockNode): string {
  const content = block[block.type] as { rich_text?: { plain_text: string }[] } | undefined;
  if (!content?.rich_text) return '';
  return joinRichText(content.rich_text);
}

function parseErrorTable(tableBlock: BlockNode): ErrorCase[] {
  const rows = ((tableBlock.__children as BlockNode[] | undefined) ?? []).filter(
    (block) => block.type === 'table_row'
  );
  const dataRows = rows.slice(1);

  const errorCases: ErrorCase[] = [];

  for (const row of dataRows) {
    const tableRow = row.table_row as { cells: { plain_text: string }[][] };
    const cells = tableRow.cells;

    const situation = joinRichText(cells[0]);
    const codeText = joinRichText(cells[1]).trim();
    const message = joinRichText(cells[2]);

    const codeMatch = codeText.match(/^(\d+)/);
    if (!codeMatch) {
      console.warn(`⚠️  응답코드에서 숫자를 찾을 수 없어 스킵합니다: "${situation}" → "${codeText}"`);
      continue;
    }

    errorCases.push({
      statusCode: parseInt(codeMatch[1], 10),
      message,
      situation,
    });
  }

  return errorCases;
}
