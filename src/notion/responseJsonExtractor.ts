import type { BlockNode } from './blockParser';
import { joinRichText } from './richText';

export interface ResponseJsonResult {
  hasBody: boolean;
  successResponseJson: string;
}

export function extractResponseJson(blocks: BlockNode[], successStatusCode: number): ResponseJsonResult {
  if (successStatusCode === 204) {
    return { hasBody: false, successResponseJson: '{}' };
  }

  const candidates = collectCodeBlocks(blocks)
    .map((block) => classifyCodeBlockText(getCodeText(block)))
    .filter((candidate): candidate is string => candidate !== null);

  if (candidates.length === 0) {
    return { hasBody: false, successResponseJson: '{}' };
  }

  if (candidates.length > 1) {
    console.warn('⚠️  응답 예시 code 블록이 여러 개 발견되어 첫 번째를 사용합니다.');
  }

  const json = candidates[0];
  try {
    JSON.parse(json);
  } catch {
    console.warn('⚠️  유효하지 않은 JSON입니다. 빈 객체로 대체합니다.');
    return { hasBody: false, successResponseJson: '{}' };
  }

  return { hasBody: true, successResponseJson: json };
}

function collectCodeBlocks(blocks: BlockNode[]): BlockNode[] {
  const result: BlockNode[] = [];
  for (const block of blocks) {
    if (block.type === 'code') {
      result.push(block);
    }
    const children = block.__children as BlockNode[] | undefined;
    if (children) {
      result.push(...collectCodeBlocks(children));
    }
  }
  return result;
}

function getCodeText(block: BlockNode): string {
  const code = block.code as { rich_text?: { plain_text: string }[] } | undefined;
  return joinRichText(code?.rich_text);
}

function classifyCodeBlockText(text: string): string | null {
  const firstLine = (text.split('\n')[0] ?? '').trim();

  if (/^[A-Z]+\s+\//.test(firstLine)) {
    return null;
  }

  if (/^HTTP\/1\.1\s+\d+/.test(firstLine)) {
    const bodyStart = text.search(/[{[]/);
    if (bodyStart === -1) return null;
    return text.slice(bodyStart).trim();
  }

  if (/^[{[]/.test(text.trim())) {
    return text.trim();
  }

  return null;
}
