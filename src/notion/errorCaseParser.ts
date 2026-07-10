import type { ErrorCase } from '../types/domain';
import type { BlockWithChildren } from './blockParser';
import { joinRichText } from './richText';

export function extractErrorCases(blocks: BlockWithChildren[], pageLabel = '(알 수 없는 페이지)'): ErrorCase[] {
  const flatBlocks = flattenBlocks(blocks);
  const startIndex = flatBlocks.findIndex((block) => getBlockText(block).includes('예외 상황'));
  if (startIndex === -1) return [];

  for (let i = startIndex + 1; i < flatBlocks.length; i++) {
    const block = flatBlocks[i];
    if (block.type === 'table') {
      return parseErrorTable(block, pageLabel);
    }
  }

  return [];
}

function flattenBlocks(blocks: BlockWithChildren[]): BlockWithChildren[] {
  const result: BlockWithChildren[] = [];
  for (const block of blocks) {
    result.push(block);
    if (block.__children) {
      result.push(...flattenBlocks(block.__children));
    }
  }
  return result;
}

function getBlockText(block: BlockWithChildren): string {
  const content = block[block.type] as { rich_text?: { plain_text: string }[] } | undefined;
  if (!content?.rich_text) return '';
  return joinRichText(content.rich_text);
}

function parseErrorTable(tableBlock: BlockWithChildren, pageLabel: string): ErrorCase[] {
  const rows = (tableBlock.__children ?? []).filter((block) => block.type === 'table_row');
  const dataRows = rows.slice(1);

  const errorCases: ErrorCase[] = [];

  for (const row of dataRows) {
    const tableRow = row.table_row as { cells: { plain_text: string }[][] };
    const cells = tableRow.cells;

    if (cells.length < 3) {
      console.warn(`⚠️  [${pageLabel}] 예외 상황 테이블 컬럼이 3개 미만입니다 (${cells.length}개). 메시지가 비어있을 수 있습니다.`);
    }

    const situation = joinRichText(cells[0]);
    const codeText = joinRichText(cells[1]).trim();
    const message = joinRichText(cells[2]);

    const codeMatch = codeText.match(/^(\d+)/);
    if (!codeMatch) {
      console.warn(`⚠️  [${pageLabel}] 응답코드에서 숫자를 찾을 수 없어 스킵합니다: "${situation}" → "${codeText}"`);
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
