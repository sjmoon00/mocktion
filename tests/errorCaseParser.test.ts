import { describe, expect, it } from 'vitest';
import type { BlockWithChildren } from '../src/notion/blockParser';
import { extractErrorCases } from '../src/notion/errorCaseParser';
import getFixture from './fixtures/get-200-submission-detail.json';
import postFixture from './fixtures/post-201-team-member.json';
import putFixture from './fixtures/put-204-sort.json';
import deleteFixture from './fixtures/delete-204-category.json';

function blocksOf(fixture: { blocks: unknown }): BlockWithChildren[] {
  return fixture.blocks as unknown as BlockWithChildren[];
}

describe('extractErrorCases', () => {
  it('GET: "예외 상황"(bulleted_list_item) 이후 테이블에서 에러 케이스 3개를 추출한다', () => {
    const { errorCases: cases, warnings } = extractErrorCases(blocksOf(getFixture));

    expect(cases).toEqual([
      { statusCode: 404, situation: '존재하지 않는 대회', message: 'Contest not found' },
      { statusCode: 404, situation: '존재하지 않는 제출', message: 'Submission not found' },
      { statusCode: 403, situation: '관리자 권한 없음', message: 'Access denied' },
    ]);
    expect(warnings).toEqual([]);
  });

  it('POST: 에러 케이스 7개(400×3, 404×1, 409×1, 401×1, 403×1)를 추출한다 (선행 정수 추출 포함)', () => {
    const { errorCases: cases } = extractErrorCases(blocksOf(postFixture));

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
    const { errorCases: cases } = extractErrorCases(blocksOf(putFixture));

    expect(cases).toEqual([{ statusCode: 401, situation: '인증되지 않은 사용자', message: '권한이 없습니다.' }]);
  });

  it('DELETE: "예외 상황"과 테이블 사이의 빈 블록을 건너뛰고 에러 케이스 4개를 추출한다', () => {
    const { errorCases: cases } = extractErrorCases(blocksOf(deleteFixture));

    expect(cases).toHaveLength(4);
    expect(cases.map((c) => c.statusCode)).toEqual([404, 409, 401, 403]);
  });

  it('"예외 상황"과 테이블이 toggle 등 중첩 블록의 __children 안에 있어도 추출한다', () => {
    const nestedBlocks: BlockWithChildren[] = [
      {
        id: 'toggle-1',
        type: 'toggle',
        has_children: true,
        toggle: { rich_text: [{ plain_text: '접기' }] },
        __children: [
          {
            id: 'bullet-1',
            type: 'bulleted_list_item',
            has_children: false,
            bulleted_list_item: { rich_text: [{ plain_text: '예외 상황' }] },
          },
          {
            id: 'table-1',
            type: 'table',
            has_children: true,
            table: { table_width: 3, has_column_header: false },
            __children: [
              {
                id: 'row-header',
                type: 'table_row',
                has_children: false,
                table_row: {
                  cells: [[{ plain_text: '상황' }], [{ plain_text: '응답코드' }], [{ plain_text: '메시지' }]],
                },
              },
              {
                id: 'row-1',
                type: 'table_row',
                has_children: false,
                table_row: {
                  cells: [[{ plain_text: '중첩된 상황' }], [{ plain_text: '400' }], [{ plain_text: 'Nested error' }]],
                },
              },
            ],
          },
        ],
      },
    ];

    const { errorCases: cases } = extractErrorCases(nestedBlocks);

    expect(cases).toEqual([{ statusCode: 400, situation: '중첩된 상황', message: 'Nested error' }]);
  });

  it('응답코드에 숫자가 없는 행은 스킵하고 경고 문구를 warnings에 담는다', () => {
    const blocks: BlockWithChildren[] = [
      {
        id: 'bullet-1',
        type: 'bulleted_list_item',
        has_children: false,
        bulleted_list_item: { rich_text: [{ plain_text: '예외 상황' }] },
      },
      {
        id: 'table-1',
        type: 'table',
        has_children: true,
        table: { table_width: 3, has_column_header: false },
        __children: [
          {
            id: 'row-header',
            type: 'table_row',
            has_children: false,
            table_row: {
              cells: [[{ plain_text: '상황' }], [{ plain_text: '응답코드' }], [{ plain_text: '메시지' }]],
            },
          },
          {
            id: 'row-bad',
            type: 'table_row',
            has_children: false,
            table_row: {
              cells: [[{ plain_text: '숫자 없음' }], [{ plain_text: '알 수 없음' }], [{ plain_text: '메시지' }]],
            },
          },
        ],
      },
    ];

    const { errorCases, warnings } = extractErrorCases(blocks, '테스트 페이지');

    expect(errorCases).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('응답코드에서 숫자를 찾을 수 없어 스킵합니다');
    expect(warnings[0]).toContain('테스트 페이지');
  });
});
