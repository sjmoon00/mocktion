import { Client } from '@notionhq/client';

export function createNotionClient(): Client {
  const token = process.env.NOTION_TOKEN;

  if (!token) {
    console.error('[notion-mock] NOTION_TOKEN 환경변수가 설정되지 않았습니다.');
    console.error('[notion-mock] .env 파일에 NOTION_TOKEN=secret_xxxx 형태로 설정하세요.');
    process.exit(1);
  }

  return new Client({ auth: token });
}
