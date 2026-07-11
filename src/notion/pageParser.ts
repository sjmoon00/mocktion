import type { Client, PageObjectResponse } from '@notionhq/client';
import type { EndpointSpec } from '../types/domain';
import { extractProperties } from './propertyExtractor';
import { fetchBlockTree } from './blockParser';
import { extractResponseJson } from './responseJsonExtractor';
import { extractErrorCases } from './errorCaseParser';
import { createEmptyCache, getCached, type CachedBlockResult, type SpecCache } from './specCache';

export type PageParseResult =
  | { ok: true; spec: EndpointSpec; cacheHit: boolean }
  | { ok: false; displayName: string; reason: string };

export interface PropertySkip {
  displayName: string;
  reason: string;
}

export interface ParseAllResult {
  specs: EndpointSpec[];
  propertySkipped: PropertySkip[];
  cache: SpecCache;
  cacheHits: number;
  cacheMisses: number;
}

export async function parsePage(
  notion: Client,
  page: PageObjectResponse,
  oldCache?: SpecCache
): Promise<PageParseResult> {
  const propResult = extractProperties(page.properties, page.url);
  if (!propResult.ok) {
    return { ok: false, displayName: propResult.displayName, reason: propResult.reason };
  }

  const { method, uriPattern, successStatusCode, displayName } = propResult.value;
  const lastEditedTime = page.last_edited_time;

  try {
    const cached = oldCache && getCached(oldCache, page.id, lastEditedTime);
    const blockResult: CachedBlockResult =
      cached ?? (await fetchAndParseBlocks(notion, page.id, successStatusCode, displayName, page.url));

    return {
      ok: true,
      spec: { method, uriPattern, successStatusCode, ...blockResult },
      cacheHit: cached !== undefined,
    };
  } catch (e) {
    return {
      ok: false,
      displayName: propResult.value.displayName,
      reason: `블록 파싱 실패: ${e instanceof Error ? e.message : e}`,
    };
  }
}

async function fetchAndParseBlocks(
  notion: Client,
  pageId: string,
  successStatusCode: number,
  displayName: string,
  pageUrl: string
): Promise<CachedBlockResult> {
  const blocks = await fetchBlockTree(notion, pageId);
  const { hasBody, successResponseJson, warnings: responseWarnings } = extractResponseJson(
    blocks,
    successStatusCode,
    displayName,
    pageUrl
  );
  const { errorCases, warnings: errorCaseWarnings } = extractErrorCases(blocks, displayName, pageUrl);
  return { hasBody, successResponseJson, errorCases, warnings: [...responseWarnings, ...errorCaseWarnings] };
}

export async function parseAllPages(
  notion: Client,
  pages: PageObjectResponse[],
  dataSourceId: string,
  oldCache?: SpecCache
): Promise<ParseAllResult> {
  const specs: EndpointSpec[] = [];
  const propertySkipped: PropertySkip[] = [];
  const newCache = createEmptyCache(dataSourceId);
  let cacheHits = 0;
  let cacheMisses = 0;

  for (const page of pages) {
    const result = await parsePage(notion, page, oldCache);
    if (result.ok) {
      specs.push(result.spec);
      const { hasBody, successResponseJson, errorCases, warnings } = result.spec;
      newCache.entries[page.id] = {
        lastEditedTime: page.last_edited_time,
        result: { hasBody, successResponseJson, errorCases, warnings },
      };
      result.cacheHit ? cacheHits++ : cacheMisses++;
    } else {
      propertySkipped.push({ displayName: result.displayName, reason: result.reason });
      const staleEntry = oldCache?.entries[page.id];
      if (staleEntry) {
        newCache.entries[page.id] = staleEntry;
      }
    }
  }

  return { specs, propertySkipped, cache: newCache, cacheHits, cacheMisses };
}
