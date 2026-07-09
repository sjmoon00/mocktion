export interface RichTextLike {
  plain_text: string;
}

export function joinRichText(richText: ReadonlyArray<RichTextLike> | undefined | null): string {
  if (!richText) return '';
  return richText.map((t) => t.plain_text).join('');
}
