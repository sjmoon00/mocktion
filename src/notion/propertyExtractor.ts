import { joinRichText } from './richText';

export interface ExtractedProperties {
  method: string;
  uriPattern: string;
  successStatusCode: number;
  displayName: string;
}

export type PropertyExtractionResult =
  | { ok: true; value: ExtractedProperties }
  | { ok: false; displayName: string; reason: string };

export function extractProperties(properties: Record<string, unknown>): PropertyExtractionResult {
  const displayName = extractDisplayName(properties);

  const method = extractMultiSelectFirst(properties['HTTP Method']);
  if (!method) {
    return { ok: false, displayName, reason: 'HTTP Method 값이 없습니다' };
  }

  const codeText = extractMultiSelectFirst(properties['응답코드']);
  if (!codeText) {
    return { ok: false, displayName, reason: '응답코드 값이 없습니다' };
  }
  const successStatusCode = parseInt(codeText, 10);
  if (Number.isNaN(successStatusCode)) {
    return { ok: false, displayName, reason: `응답코드 값을 숫자로 변환할 수 없습니다: ${codeText}` };
  }

  const uriPattern = extractRichText(properties['URI']);
  if (!uriPattern) {
    return { ok: false, displayName, reason: 'URI 값이 없습니다' };
  }

  return { ok: true, value: { method, uriPattern, successStatusCode, displayName } };
}

function extractMultiSelectFirst(prop: unknown): string | undefined {
  const p = prop as { type?: string; multi_select?: { name: string }[] } | undefined;
  if (!p || p.type !== 'multi_select') return undefined;

  const values = p.multi_select ?? [];
  if (values.length === 0) return undefined;
  if (values.length > 1) {
    console.warn(`⚠️  multi_select 값이 2개 이상입니다. 첫 번째 값(${values[0].name})을 사용합니다.`);
  }
  return values[0].name;
}

function extractRichText(prop: unknown): string {
  const p = prop as { type?: string; rich_text?: { plain_text: string }[] } | undefined;
  if (!p || p.type !== 'rich_text') return '';
  return joinRichText(p.rich_text);
}

function extractDisplayName(properties: Record<string, unknown>): string {
  for (const value of Object.values(properties)) {
    const p = value as { type?: string; title?: { plain_text: string }[] };
    if (p?.type === 'title') {
      return joinRichText(p.title) || '(제목 없음)';
    }
  }
  return '(제목 없음)';
}
