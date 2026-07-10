import type { Client, PageObjectResponse } from '@notionhq/client';
import type { EndpointSpec } from '../types/domain';
import { extractProperties } from './propertyExtractor';
import { fetchBlockTree } from './blockParser';
import { extractResponseJson } from './responseJsonExtractor';
import { extractErrorCases } from './errorCaseParser';

export type PageParseResult =
  | { ok: true; spec: EndpointSpec }
  | { ok: false; displayName: string; reason: string };

export interface PropertySkip {
  displayName: string;
  reason: string;
}

export interface ParseAllResult {
  specs: EndpointSpec[];
  propertySkipped: PropertySkip[];
}

export async function parsePage(notion: Client, page: PageObjectResponse): Promise<PageParseResult> {
  const propResult = extractProperties(page.properties);
  if (!propResult.ok) {
    return { ok: false, displayName: propResult.displayName, reason: propResult.reason };
  }

  const { method, uriPattern, successStatusCode } = propResult.value;

  try {
    const blocks = await fetchBlockTree(notion, page.id);
    const { hasBody, successResponseJson } = extractResponseJson(blocks, successStatusCode);
    const errorCases = extractErrorCases(blocks);

    return {
      ok: true,
      spec: { method, uriPattern, successStatusCode, hasBody, successResponseJson, errorCases },
    };
  } catch (e) {
    return {
      ok: false,
      displayName: propResult.value.displayName,
      reason: `블록 파싱 실패: ${e instanceof Error ? e.message : e}`,
    };
  }
}

export async function parseAllPages(notion: Client, pages: PageObjectResponse[]): Promise<ParseAllResult> {
  const specs: EndpointSpec[] = [];
  const propertySkipped: PropertySkip[] = [];

  for (const page of pages) {
    const result = await parsePage(notion, page);
    if (result.ok) {
      specs.push(result.spec);
    } else {
      propertySkipped.push({ displayName: result.displayName, reason: result.reason });
    }
  }

  return { specs, propertySkipped };
}
