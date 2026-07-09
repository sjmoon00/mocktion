import { describe, expect, it } from 'vitest';
import type { BlockNode } from '../src/notion/blockParser';
import { extractResponseJson } from '../src/notion/responseJsonExtractor';
import getFixture from './fixtures/get-200-submission-detail.json';
import postFixture from './fixtures/post-201-team-member.json';
import putFixture from './fixtures/put-204-sort.json';
import deleteFixture from './fixtures/delete-204-category.json';

function blocksOf(fixture: { blocks: unknown }): BlockNode[] {
  return fixture.blocks as unknown as BlockNode[];
}

describe('extractResponseJson', () => {
  it('GET: 응답 JSON이 있는 code 블록을 추출한다 (2순위)', () => {
    const result = extractResponseJson(blocksOf(getFixture), 200);

    expect(result.hasBody).toBe(true);
    const parsed = JSON.parse(result.successResponseJson);
    expect(parsed.submissionId).toBe(12);
    expect(parsed.teamName).toBe('오퍼스');
  });

  it('POST: 응답 JSON 예시가 없으면 빈 객체를 사용한다 (3순위)', () => {
    const result = extractResponseJson(blocksOf(postFixture), 201);

    expect(result).toEqual({ hasBody: false, successResponseJson: '{}' });
  });

  it('PUT: 204는 code 블록을 파싱하지 않고 즉시 확정한다 (1순위)', () => {
    const result = extractResponseJson(blocksOf(putFixture), 204);

    expect(result).toEqual({ hasBody: false, successResponseJson: '{}' });
  });

  it('DELETE: 204는 요청 code 블록의 language(java) 태그와 무관하게 무시된다 (1순위)', () => {
    const result = extractResponseJson(blocksOf(deleteFixture), 204);

    expect(result).toEqual({ hasBody: false, successResponseJson: '{}' });
  });
});
