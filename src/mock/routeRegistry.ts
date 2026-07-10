import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import type { EndpointSpec } from '../types/domain';

export function createMockServer(specs: EndpointSpec[]): Express {
  const app = express();
  app.use(cors());

  const seen = new Set<string>();

  for (const spec of specs) {
    const expressPath = spec.uriPattern.replace(/\{([\w-]+)\}/g, ':$1');
    const key = `${spec.method.toUpperCase()} ${expressPath}`;
    if (seen.has(key)) {
      console.warn(`⚠️  중복 엔드포인트 감지: ${key} — 먼저 등록된 것이 우선 적용됩니다.`);
      continue;
    }
    seen.add(key);

    const handler = (_req: Request, res: Response) => {
      if (spec.successStatusCode === 204) {
        res.status(204).end();
        return;
      }
      res
        .status(spec.successStatusCode)
        .type('application/json')
        .send(spec.hasBody ? spec.successResponseJson : '{}');
    };

    try {
      switch (spec.method.toUpperCase()) {
        case 'GET': app.get(expressPath, handler); break;
        case 'POST': app.post(expressPath, handler); break;
        case 'PUT': app.put(expressPath, handler); break;
        case 'PATCH': app.patch(expressPath, handler); break;
        case 'DELETE': app.delete(expressPath, handler); break;
        default:
          console.warn(`⚠️  지원하지 않는 HTTP 메서드 스킵: ${spec.method} ${spec.uriPattern}`);
      }
    } catch (e) {
      console.warn(`⚠️  라우트 등록 실패, 스킵: ${spec.method} ${spec.uriPattern} — ${e instanceof Error ? e.message : e}`);
    }
  }

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      registeredEndpoints: specs.map((s) => `${s.method} ${s.uriPattern}`),
    });
  });

  return app;
}
