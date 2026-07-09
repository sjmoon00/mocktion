import { describe, expect, it } from 'vitest';
import type { BlockNode } from '../src/notion/blockParser';
import { extractErrorCases } from '../src/notion/errorCaseParser';
import getFixture from './fixtures/get-200-submission-detail.json';
import postFixture from './fixtures/post-201-team-member.json';
import putFixture from './fixtures/put-204-sort.json';
import deleteFixture from './fixtures/delete-204-category.json';

function blocksOf(fixture: { blocks: unknown }): BlockNode[] {
  return fixture.blocks as unknown as BlockNode[];
}

describe('extractErrorCases', () => {
  it('GET: "예외 상황"(bulleted_list_item) 이후 테이블에서 에러 케이스 3개를 추출한다', () => {
    const cases = extractErrorCases(blocksOf(getFixture));

    expect(cases).toEqual([
      { statusCode: 404, situation: '존재하지 않는 대회', message: 'Contest not found' },
      { statusCode: 404, situation: '존재하지 않는 제출', message: 'Submission not found' },
      { statusCode: 403, situation: '관리자 권한 없음', message: 'Access denied' },
    ]);
  });

  it('POST: 에러 케이스 7개(400×3, 404×1, 409×1, 401×1, 403×1)를 추출한다 (선행 정수 추출 포함)', () => {
    const cases = extractErrorCases(blocksOf(postFixture));

    expect(cases).toHaveLength(7);
    const counts = cases.reduce<Record<number, number>>((acc, c) => {
      acc[c.statusCode] = (acc[c.statusCode] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ 400: 3, 404: 1, 409: 1, 401: 1, 403: 1 });

    // "409 Conflict" -> 409, "403 "(trailing space) -> 403 로 선행 정수만 추출
    expect(cases.find((c) => c.situation.includes('동일한 참가자명'))?.statusCode).toBe(409);
    expect(cases.find((c) => c.situation.includes('관리자가 아닌 사용자'))?.statusCode).toBe(403);
  });

  it('PUT: 에러 케이스 1개(401)를 추출한다', () => {
    const cases = extractErrorCases(blocksOf(putFixture));

    expect(cases).toEqual([{ statusCode: 401, situation: '인증되지 않은 사용자', message: '권한이 없습니다.' }]);
  });

  it('DELETE: "예외 상황"과 테이블 사이의 빈 블록을 건너뛰고 에러 케이스 4개를 추출한다', () => {
    const cases = extractErrorCases(blocksOf(deleteFixture));

    expect(cases).toHaveLength(4);
    expect(cases.map((c) => c.statusCode)).toEqual([404, 409, 401, 403]);
  });
});
