import 'dotenv/config';
import { Command } from 'commander';
import { createNotionClient } from './notion/notionClient';
import { parseDatabaseId, resolveDataSourceId, fetchPages } from './notion/databaseFetcher';
import { parseAllPages } from './notion/pageParser';
import { startMockServer } from './mock/server';

const program = new Command();
program
  .requiredOption('--db <url>', 'Notion 데이터베이스 URL 또는 ID')
  .option('--status <value>', '포함할 상태값 (미지정 시 전체)')
  .option('--port <number>', '목서버 포트', '8080');
program.parse();
const opts = program.opts<{ db: string; status?: string; port: string }>();

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
  const { specs, propertySkipped } = await parseAllPages(notion, pages, dataSourceId);
  for (const s of propertySkipped) {
    console.warn(`  ⚠️  스킵됨: ${s.displayName} — ${s.reason}`);
  }

  startMockServer(specs, port);
}

main().catch((err) => {
  console.error('[notion-mock] 오류:', err instanceof Error ? err.message : err);
  process.exit(1);
});
