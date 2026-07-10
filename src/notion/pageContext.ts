export function buildPageContext(
  displayName: string,
  pageUrl: string,
  sectionLabel: string,
  blockId?: string
): string {
  if (!pageUrl) {
    return `${displayName} > ${sectionLabel}`;
  }

  const link = blockId ? `${pageUrl}#${blockId.replace(/-/g, '')}` : pageUrl;
  return `${displayName} > ${sectionLabel} (${link})`;
}
