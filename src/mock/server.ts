import { createMockServer } from './routeRegistry';
import type { EndpointSpec } from '../types/domain';

export function startMockServer(specs: EndpointSpec[], port: number): void {
  const { app, registered } = createMockServer(specs);

  const httpServer = app.listen(port, () => {
    const errorCaseCount = registered.reduce((n, s) => n + s.errorCases.length, 0);

    console.log(`\n[notion-mock] 목서버 실행 완료 🚀`);
    console.log(`  → http://localhost:${port}`);
    console.log(`  → 등록된 엔드포인트: ${registered.length}개`);
    console.log(`  → 에러 케이스: ${errorCaseCount}개`);

    console.log(`\n등록된 엔드포인트 목록:`);
    for (const spec of registered) {
      console.log(`  ${spec.method.padEnd(6)} ${spec.uriPattern}  →  ${spec.successStatusCode}`);
      for (const err of spec.errorCases) {
        console.log(`    └─ ${err.statusCode} (${err.situation}): ${err.message}`);
      }
    }
  });

  httpServer.on('error', (err) => {
    console.error('[notion-mock] 오류:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
