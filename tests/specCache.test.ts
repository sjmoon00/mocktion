import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createEmptyCache, getCached, loadCache, saveCache } from '../src/notion/specCache';

const tmpPath = path.join(os.tmpdir(), `specCache-test-${process.pid}.json`);

afterEach(() => {
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
});

describe('loadCache / saveCache', () => {
  it('캐시 파일이 없으면 빈 캐시를 반환한다', () => {
    const cache = loadCache(tmpPath, 'ds-1');

    expect(cache).toEqual({ schemaVersion: 1, dataSourceId: 'ds-1', entries: {} });
  });

  it('저장한 캐시를 그대로 다시 읽는다', () => {
    const cache = createEmptyCache('ds-1');
    cache.entries['page-1'] = {
      lastEditedTime: '2026-01-01T00:00:00.000Z',
      result: { hasBody: true, successResponseJson: '{}', errorCases: [], warnings: [] },
    };
    saveCache(tmpPath, cache);

    expect(loadCache(tmpPath, 'ds-1')).toEqual(cache);
  });

  it('dataSourceId가 다르면 빈 캐시로 폴백한다', () => {
    saveCache(tmpPath, createEmptyCache('ds-1'));

    expect(loadCache(tmpPath, 'ds-2').entries).toEqual({});
  });

  it('schemaVersion이 다르면 빈 캐시로 폴백한다', () => {
    fs.writeFileSync(tmpPath, JSON.stringify({ schemaVersion: 999, dataSourceId: 'ds-1', entries: {} }));

    expect(loadCache(tmpPath, 'ds-1').entries).toEqual({});
  });

  it('손상된 JSON이면 빈 캐시로 폴백한다', () => {
    fs.writeFileSync(tmpPath, '{ not valid json');

    expect(loadCache(tmpPath, 'ds-1')).toEqual({ schemaVersion: 1, dataSourceId: 'ds-1', entries: {} });
  });
});

describe('getCached', () => {
  it('lastEditedTime이 일치하면 결과를 반환한다', () => {
    const cache = createEmptyCache('ds-1');
    const result = { hasBody: true, successResponseJson: '{}', errorCases: [], warnings: [] };
    cache.entries['page-1'] = { lastEditedTime: 't1', result };

    expect(getCached(cache, 'page-1', 't1')).toEqual(result);
  });

  it('lastEditedTime이 다르면 undefined를 반환한다', () => {
    const cache = createEmptyCache('ds-1');
    cache.entries['page-1'] = {
      lastEditedTime: 't1',
      result: { hasBody: true, successResponseJson: '{}', errorCases: [], warnings: [] },
    };

    expect(getCached(cache, 'page-1', 't2')).toBeUndefined();
  });

  it('캐시에 없는 페이지면 undefined를 반환한다', () => {
    const cache = createEmptyCache('ds-1');

    expect(getCached(cache, 'unknown', 't1')).toBeUndefined();
  });

  it('lastEditedTime은 일치하지만 result shape가 잘못되면 undefined를 반환한다', () => {
    const cache = createEmptyCache('ds-1');
    cache.entries['page-1'] = {
      lastEditedTime: 't1',
      // errorCases가 배열이 아닌 손상된 shape
      result: { hasBody: true, successResponseJson: '{}', errorCases: 'not-an-array' } as never,
    };

    expect(getCached(cache, 'page-1', 't1')).toBeUndefined();
  });
});
