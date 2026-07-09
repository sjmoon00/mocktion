export interface RichTextLike {
  plain_text: string;
}

export function joinRichText(richText: ReadonlyArray<RichTextLike> | undefined | null): string {
  if (!richText) return '';
  return richText.map((t) => t.plain_text).join('');
}

export function extractTitleText(properties: Record<string, unknown>): string {
  for (const value of Object.values(properties)) {
    const p = value as { type?: string; title?: RichTextLike[] } | undefined;
    if (p?.type === 'title') {
      return joinRichText(p.title) || '(제목 없음)';
    }
  }
  return '(제목 없음)';
}
