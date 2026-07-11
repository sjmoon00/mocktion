import { describe, expect, it } from 'vitest';
import type { BlockWithChildren } from '../src/notion/blockParser';
import { extractResponseJson } from '../src/notion/responseJsonExtractor';
import getFixture from './fixtures/get-200-submission-detail.json';
import postFixture from './fixtures/post-201-team-member.json';
import putFixture from './fixtures/put-204-sort.json';
import deleteFixture from './fixtures/delete-204-category.json';

function blocksOf(fixture: { blocks: unknown }): BlockWithChildren[] {
  return fixture.blocks as unknown as BlockWithChildren[];
}

function codeBlock(text: string): BlockWithChildren {
  return {
    id: 'block-1',
    type: 'code',
    has_children: false,
    code: { rich_text: [{ plain_text: text }] },
  };
}

describe('extractResponseJson', () => {
  it('GET: 응답 JSON이 있는 code 블록을 추출한다 (2순위)', () => {
    const result = extractResponseJson(blocksOf(getFixture), 200);

    expect(result.hasBody).toBe(true);
    const parsed = JSON.parse(result.successResponseJson);
    expect(parsed.submissionId).toBe(12);
    expect(parsed.teamName).toBe('오퍼스');
    expect(result.warnings).toEqual([]);
  });

  it('POST: 응답 JSON 예시가 없으면 빈 객체를 사용한다 (3순위)', () => {
    const result = extractResponseJson(blocksOf(postFixture), 201);

    expect(result).toEqual({ hasBody: false, successResponseJson: '{}', warnings: [] });
  });

  it('PUT: 204는 code 블록을 파싱하지 않고 즉시 확정한다 (1순위)', () => {
    const result = extractResponseJson(blocksOf(putFixture), 204);

    expect(result).toEqual({ hasBody: false, successResponseJson: '{}', warnings: [] });
  });

  it('DELETE: 204는 요청 code 블록의 language(java) 태그와 무관하게 무시된다 (1순위)', () => {
    const result = extractResponseJson(blocksOf(deleteFixture), 204);

    expect(result).toEqual({ hasBody: false, successResponseJson: '{}', warnings: [] });
  });

  it('유효하지 않은 JSON 응답 예시는 경고 후 빈 객체로 대체하고 warnings에 담는다', () => {
    const blocks = [codeBlock('HTTP/1.1 200 OK\n\n{ "broken": }')];

    const result = extractResponseJson(blocks, 200, '테스트 페이지');

    expect(result.hasBody).toBe(false);
    expect(result.successResponseJson).toBe('{}');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('유효하지 않은 JSON입니다');
    expect(result.warnings[0]).toContain('테스트 페이지');
  });

  it('응답 예시 code 블록이 여러 개면 첫 번째를 사용하고 warnings에 담는다', () => {
    const blocks = [codeBlock('{"first": true}'), codeBlock('{"second": true}')];

    const result = extractResponseJson(blocks, 200, '테스트 페이지');

    expect(JSON.parse(result.successResponseJson)).toEqual({ first: true });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('여러 개 발견');
  });
});
