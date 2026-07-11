import 'dotenv/config';
import { Command } from 'commander';
import * as path from 'path';
import { createNotionClient } from './notion/notionClient';
import { parseDatabaseId, resolveDataSourceId, fetchPages } from './notion/databaseFetcher';
import { parseAllPages } from './notion/pageParser';
import { loadCache, saveCache } from './notion/specCache';
import { startMockServer } from './mock/server';

const CACHE_PATH = path.join(process.cwd(), '.notion-mock-cache.json');

const program = new Command();
program
  .requiredOption('--db <url>', 'Notion 데이터베이스 URL 또는 ID')
  .option('--status <value>', '포함할 상태값 (미지정 시 전체)')
  .option('--port <number>', '목서버 포트', '8080')
  .option('--no-cache', '로컬 캐시를 사용하지 않고 매번 전체를 새로 파싱');
program.parse();
const opts = program.opts<{ db: string; status?: string; port: string; cache: boolean }>();

async function main(): Promise<void> {
  const port = parseInt(opts.port, 10);
  if (Number.isNaN(port) || port < 0 || port > 65535) {
    console.error(`[notion-mock] 오류: --port 값이 올바르지 않습니다: "${opts.port}" (0~65535 사이 숫자를 입력하세요)`);
    process.exit(1);
  }

  const notion = createNotionClient();

  console.log('[notion-mock] Notion DB 연결 중...');
  const databaseId = parseDatabaseId(opts.db);
  const dataSourceId = await resolveDataSourceId(notion, databaseId);

  const { pages, skipped } = await fetchPages(notion, dataSourceId, opts.status);
  console.log(`[notion-mock] 총 ${pages.length + skipped.length}개 페이지 발견`);
  if (opts.status) {
    console.log(`[notion-mock] 상태 필터("${opts.status}") 적용 → ${pages.length}개 처리, ${skipped.length}개 스킵`);
  }
  if (skipped.length > 0) {
    console.log(`\n⚠️  스킵된 페이지:`);
    for (const s of skipped) {
      console.log(`  - ${s.displayName} (상태: ${s.statusValue})`);
    }
  }

  console.log(`\n[notion-mock] 파싱 중...`);
  const oldCache = opts.cache ? loadCache(CACHE_PATH, dataSourceId) : undefined;
  const { specs, propertySkipped, cache, cacheHits, cacheMisses } = await parseAllPages(
    notion,
    pages,
    dataSourceId,
    oldCache
  );
  console.log(
    `[notion-mock] 캐시 적중 ${cacheHits}개, 새로 파싱 ${cacheMisses}개${opts.cache ? '' : ' (--no-cache)'}`
  );
  if (opts.cache) {
    saveCache(CACHE_PATH, cache);
  }
  for (const spec of specs) {
    for (const warning of spec.warnings) {
      console.warn(warning);
    }
  }
  for (const s of propertySkipped) {
    console.warn(`  ⚠️  스킵됨: ${s.displayName} — ${s.reason}`);
  }

  startMockServer(specs, port);
}

main().catch((err) => {
  console.error('[notion-mock] 오류:', err instanceof Error ? err.message : err);
  process.exit(1);
});
