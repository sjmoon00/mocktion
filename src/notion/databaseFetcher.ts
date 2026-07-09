import type { Client, PageObjectResponse } from '@notionhq/client';
import { extractDatabaseId, isFullDatabase, isFullPage } from '@notionhq/client';
import { joinRichText } from './richText';

export interface SkippedPage {
  displayName: string;
  statusValue: string;
}

export interface FetchPagesResult {
  pages: PageObjectResponse[];
  skipped: SkippedPage[];
}

export function parseDatabaseId(dbUrlOrId: string): string {
  const id = extractDatabaseId(dbUrlOrId);
  if (!id) {
    throw new Error(`Notion DB URL에서 database_id를 추출할 수 없습니다: ${dbUrlOrId}`);
  }
  return id;
}

export async function resolveDataSourceId(notion: Client, databaseId: string): Promise<string> {
  const database = await notion.databases.retrieve({ database_id: databaseId });

  if (!isFullDatabase(database)) {
    throw new Error(
      '데이터소스 ID를 찾을 수 없습니다. Notion-Version 헤더 또는 SDK 버전을 확인하세요.'
    );
  }
  if (database.data_sources.length === 0) {
    throw new Error(
      '데이터소스 ID를 찾을 수 없습니다. Notion-Version 헤더 또는 SDK 버전을 확인하세요.'
    );
  }
  if (database.data_sources.length > 1) {
    throw new Error(
      `멀티 데이터소스 데이터베이스는 지원하지 않습니다 (data source ${database.data_sources.length}개 발견). 단일 데이터소스 DB만 지원합니다.`
    );
  }

  return database.data_sources[0].id;
}

export async function fetchPages(
  notion: Client,
  dataSourceId: string,
  statusFilter?: string
): Promise<FetchPagesResult> {
  const pages: PageObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.dataSources.query({ data_source_id: dataSourceId, start_cursor: cursor });
    pages.push(...response.results.filter(isFullPage));
    if (response.has_more && !response.next_cursor) {
      throw new Error('Notion API 페이지네이션 응답이 비정상입니다: has_more=true인데 next_cursor가 없습니다.');
    }
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  return filterPagesByStatus(pages, statusFilter);
}

export function filterPagesByStatus(pages: PageObjectResponse[], statusFilter?: string): FetchPagesResult {
  if (!statusFilter) {
    return { pages, skipped: [] };
  }

  const matched: PageObjectResponse[] = [];
  const skipped: SkippedPage[] = [];
  let anyStatusValueFound = false;

  for (const page of pages) {
    const statusValue = readStatusValue(page.properties['상태']);
    if (statusValue !== undefined) anyStatusValueFound = true;

    if (statusValue === statusFilter) {
      matched.push(page);
    } else {
      skipped.push({ displayName: readTitleDisplayName(page.properties), statusValue: statusValue ?? '(없음)' });
    }
  }

  if (pages.length > 0 && !anyStatusValueFound) {
    console.warn(
      `⚠️  '상태' 프로퍼티를 가진 페이지를 찾을 수 없습니다. --status 필터(${statusFilter})가 전체 페이지를 스킵했을 수 있습니다.`
    );
  }

  return { pages: matched, skipped };
}

function readStatusValue(prop: unknown): string | undefined {
  if (!prop || typeof prop !== 'object') return undefined;
  const p = prop as { type?: string; status?: { name: string } | null; select?: { name: string } | null };
  if (p.type === 'status') return p.status?.name;
  if (p.type === 'select') return p.select?.name;
  return undefined;
}

function readTitleDisplayName(properties: PageObjectResponse['properties']): string {
  for (const value of Object.values(properties)) {
    if ((value as { type?: string }).type === 'title') {
      return joinRichText((value as { title: { plain_text: string }[] }).title) || '(제목 없음)';
    }
  }
  return '(제목 없음)';
}
