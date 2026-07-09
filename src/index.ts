import 'dotenv/config';
import { createNotionClient } from './notion/notionClient';

const notion = createNotionClient();

console.log('[notion-mock] NOTION_TOKEN 확인 완료, Notion Client 생성됨');
