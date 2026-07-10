import * as fs from 'fs';
import type { ErrorCase } from '../types/domain';

const SCHEMA_VERSION = 1;

export interface CachedBlockResult {
  hasBody: boolean;
  successResponseJson: string;
  errorCases: ErrorCase[];
}

export interface CacheEntry {
  lastEditedTime: string;
  result: CachedBlockResult;
}

export interface SpecCache {
  schemaVersion: number;
  dataSourceId: string;
  entries: Record<string, CacheEntry>;
}

export function createEmptyCache(dataSourceId: string): SpecCache {
  return { schemaVersion: SCHEMA_VERSION, dataSourceId, entries: {} };
}

export function loadCache(filePath: string, dataSourceId: string): SpecCache {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as SpecCache;
    if (
      parsed.schemaVersion !== SCHEMA_VERSION ||
      parsed.dataSourceId !== dataSourceId ||
      typeof parsed.entries !== 'object' ||
      parsed.entries === null
    ) {
      return createEmptyCache(dataSourceId);
    }
    return parsed;
  } catch {
    return createEmptyCache(dataSourceId);
  }
}

export function saveCache(filePath: string, cache: SpecCache): void {
  fs.writeFileSync(filePath, JSON.stringify(cache), 'utf-8');
}

export function getCached(cache: SpecCache, pageId: string, lastEditedTime: string): CachedBlockResult | undefined {
  const entry = cache.entries[pageId];
  if (!entry || entry.lastEditedTime !== lastEditedTime) return undefined;
  return entry.result;
}
