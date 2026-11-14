import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { CONFLICT_SEPARATOR, type Op } from '../src/protocol.js';
import { startTestServer, type TestCtx } from './helpers.js';

let t: TestCtx;
let auth: Record<string, string>;
beforeAll(async () => {
  t = await startTestServer({ HISTORY_KEEP: '5' });
  auth = { authorization: `Bearer ${await t.token()}` };
});
afterAll(async () => t?.close());

const uuid = () => crypto.randomUUID();
async function push(ops: Partial<Op>[]) {
  const r = await t.app.inject({ method: 'POST', url: '/api/sync/push', headers: auth, payload: { ops } });
  expect(r.statusCode).toBe(200);
  return r.json().results as any[];
}
async function pull(since: number) {
  return (await t.app.inject({ method: 'GET', url: `/api/sync/pull?since=${since}`, headers: auth })).json();
}
async function history(date: string) {
  return (await t.app.inject({ method: 'GET', url: `/api/notes/${date}/history`, headers: auth })).json().history as any[];
}

describe('서버 동기화', () => {
  it('저장할 때마다 version 이 오르고 변경 번호가 매겨진다', async () => {
    const [a] = await push([{ opId: uuid(), date: '2026-03-01', baseVersion: 0, content: '첫 메모 😀' }]);
    expect(a.status).toBe('applied');
    expect(a.note.version).toBe(1);
    const [b] = await push([{ opId: uuid(), date: '2026-03-01', baseVersion: 1, content: '둘째', color: 'blue' }]);
    expect(b.note.version).toBe(2);
    expect(b.seq).toBeGreaterThan(a.seq);
    expect(b.note.color).toBe('blue');
    const p = await pull(0);
    expect(p.notes.find((n: any) => n.date === '2026-03-01').content).toBe('둘째');
  });

  it('같은 opId 를 다시 보내면 한 번만 반영된다', async () => {
    const op = { opId: uuid(), date: '2026-03-02', baseVersion: 0, content: '한 번만' };
    const [r1] = await push([op]);
    const [r2] = await push([op]);
    expect(r1.status).toBe('applied');
    expect(r2.status).toBe('duplicate');
    expect(r2.note.version).toBe(r1.note.version);
    expect((await history('2026-03-02')).length).toBe(1);
  });

  it('동시에 같은 opId 를 보내도 한 번만 반영된다', async () => {
    const op = { opId: uuid(), date: '2026-03-03', baseVersion: 0, content: '동시' };
    const rs = await Promise.all([push([op]), push([op]), push([op])]);
    const statuses = rs.map((r) => r[0].status).sort();
    expect(statuses).toEqual(['applied', 'duplicate', 'duplicate']);
  });

  it('baseVersion 이 다르면 덮어쓰지 않고 합친 뒤 충돌 표시, 두 버전 모두 이력에 남는다', async () => {
    await push([{ opId: uuid(), date: '2026-03-04', baseVersion: 0, content: '원본' }]);
    await push([{ opId: uuid(), date: '2026-03-04', baseVersion: 1, content: '기기A 수정' }]);
    const [r] = await push([{ opId: uuid(), date: '2026-03-04', baseVersion: 1, content: '기기B 수정' }]);
    expect(r.status).toBe('merged');
    expect(r.note.content).toBe(`기기A 수정\n${CONFLICT_SEPARATOR}\n기기B 수정`);
    expect(r.note.conflict).toBe(true);
    const h = await history('2026-03-04');
    const contents = h.map((x) => x.content);
    expect(contents).toContain('기기A 수정');
    expect(contents).toContain('기기B 수정');
    expect(h.find((x) => x.content === '기기B 수정').reason).toBe('conflict_client');

    // 구분선을 지우고 저장하면 충돌 표시가 풀린다
    const [fix] = await push([{ opId: uuid(), date: '2026-03-04', baseVersion: r.note.version, content: '정리함' }]);
    expect(fix.note.conflict).toBe(false);
  });

  it('충돌 표시를 직접 해제할 수 있다', async () => {
    await push([{ opId: uuid(), date: '2026-03-05', baseVersion: 0, content: 'x' }]);
    await push([{ opId: uuid(), date: '2026-03-05', baseVersion: 1, content: 'y' }]);
    const [m] = await push([{ opId: uuid(), date: '2026-03-05', baseVersion: 1, content: 'z' }]);
    const [r] = await push([{ opId: uuid(), date: '2026-03-05', baseVersion: m.note.version, resolveConflict: true }]);
    expect(r.note.conflict).toBe(false);
    expect(r.note.content).toBe(m.note.content);
  });

  it('색만 바꾼 op 는 내용 충돌을 만들지 않는다', async () => {
    await push([{ opId: uuid(), date: '2026-03-06', baseVersion: 0, content: '내용' }]);
    await push([{ opId: uuid(), date: '2026-03-06', baseVersion: 1, content: '다른 기기 내용' }]);
    const [r] = await push([{ opId: uuid(), date: '2026-03-06', baseVersion: 1, color: 'red' }]);
    expect(r.status).toBe('applied');
    expect(r.note.content).toBe('다른 기기 내용');
    expect(r.note.color).toBe('red');
    expect(r.note.conflict).toBe(false);
  });

  it('동시 저장 20건이 하나도 유실되지 않고 version 이 1씩 오른다', async () => {
    const date = '2026-03-07';
    const rs = await Promise.all(
      Array.from({ length: 20 }, (_, i) => push([{ opId: uuid(), date, baseVersion: 0, content: `줄${i}` }])),
    );
    const versions = rs.map((r) => r[0].note.version).sort((a, b) => a - b);
    expect(versions).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const final = (await pull(0)).notes.find((n: any) => n.date === date);
    for (let i = 0; i < 20; i++) expect(final.content).toContain(`줄${i}`);
  });

  it('이력은 날짜별로 최근 N개만 보관한다', async () => {
    const date = '2026-03-08';
    let v = 0;
    for (let i = 0; i < 8; i++) {
      const [r] = await push([{ opId: uuid(), date, baseVersion: v, content: `v${i}` }]);
      v = r.note.version;
    }
    const h = await history(date);
    expect(h.length).toBe(5); // HISTORY_KEEP=5
    expect(h[0].content).toBe('v7');
  });

  it('since 이후 변경분만 받고, 페이지로 나눠 받을 수 있다', async () => {
    const before = (await pull(0)).lastSeq;
    await push([
      { opId: uuid(), date: '2026-04-01', baseVersion: 0, content: 'a' },
      { opId: uuid(), date: '2026-04-02', baseVersion: 0, content: 'b' },
      { opId: uuid(), date: '2026-04-03', baseVersion: 0, content: 'c' },
    ]);
    const p = await pull(before);
    expect(p.notes.map((n: any) => n.date)).toEqual(['2026-04-01', '2026-04-02', '2026-04-03']);
    const p1 = (await t.app.inject({ method: 'GET', url: `/api/sync/pull?since=${before}&limit=2`, headers: auth })).json();
    expect(p1.more).toBe(true);
    expect(p1.notes.length).toBe(2);
    const p2 = (await t.app.inject({ method: 'GET', url: `/api/sync/pull?since=${p1.lastSeq}&limit=2`, headers: auth })).json();
    expect(p2.notes.map((n: any) => n.date)).toEqual(['2026-04-03']);
    expect(p2.more).toBe(false);
  });

  it('클라이언트 since 가 서버보다 크면 reset 을 알려 준다 (백업 복원 등)', async () => {
    const p = await pull(10_000_000);
    expect(p.reset).toBe(true);
  });

  it('내보내기 → 가져오기 시 파일에 있는 날짜만 덮어쓰고 이력에 남는다', async () => {
    const exp = (await t.app.inject({ method: 'GET', url: '/api/export', headers: auth })).json();
    expect(exp.format).toBe('deskcal-export');
    const r = await t.app.inject({
      method: 'POST',
      url: '/api/import',
      headers: auth,
      payload: { format: 'deskcal-export', notes: [{ date: '2026-03-01', content: '가져온 내용', color: null }], customHolidays: [{ date: '2026-12-31', name: '임시' }] },
    });
    expect(r.json().imported).toBe(1);
    const h = await history('2026-03-01');
    expect(h[0].reason).toBe('import');
    expect(h[0].content).toBe('가져온 내용');
    const hol = (await t.app.inject({ method: 'GET', url: '/api/holidays', headers: auth })).json().holidays;
    expect(hol.find((x: any) => x.date === '2026-12-31')?.custom).toBe(true);
    expect(hol.find((x: any) => x.date === '2027-02-09')?.name).toBe('대체공휴일');
  });
});
