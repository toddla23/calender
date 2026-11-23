// 사용자별 달력 (D-015), 누구나 가입 (D-017), 용량·속도 제한
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import mysql from 'mysql2/promise';
import { loadConfig } from '../src/config.js';
import { createPool, migrate } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { sha256 } from '../src/auth.js';
import { ALLOWED, fakeGoogle, resetDb, startTestServer, testEnv, type TestCtx } from './helpers.js';

const OPEN_ENV = { ALLOWED_EMAILS: '*', ADMIN_EMAILS: ALLOWED, CONTACT_EMAIL: 'contact@example.com' };

let t: TestCtx | undefined;
afterEach(async () => {
  await t?.close();
  t = undefined;
});
afterAll(async () => t?.close());

const uuid = () => crypto.randomUUID();
const bearer = (tok: string) => ({ authorization: `Bearer ${tok}` });

async function push(tok: string, ops: object[]) {
  const r = await t!.app.inject({ method: 'POST', url: '/api/sync/push', headers: bearer(tok), payload: { ops } });
  return r;
}
async function get(tok: string, url: string) {
  return t!.app.inject({ method: 'GET', url, headers: bearer(tok) });
}

const cookieOf = (setCookie: string | string[] | undefined, name: string) => {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return arr.find((c) => c.startsWith(name + '='));
};
async function webLogin(email: string, ip = '203.0.113.50') {
  const start = await t!.app.inject({ method: 'GET', url: '/auth/google/start', headers: { 'x-forwarded-for': ip } });
  const state = new URL(start.headers.location as string).searchParams.get('state')!;
  const oauth = cookieOf(start.headers['set-cookie'], 'dc_oauth')!.split(';')[0];
  return t!.app.inject({
    method: 'GET',
    url: `/auth/google/callback?state=${state}&code=${encodeURIComponent('ok:' + email)}`,
    headers: { cookie: oauth, 'x-forwarded-for': ip },
  });
}

describe('설정: 누구나 가입', () => {
  it('ALLOWED_EMAILS=* 이면 ADMIN_EMAILS 와 CONTACT_EMAIL 이 있어야 시작한다', () => {
    expect(() => loadConfig({ ...testEnv, ALLOWED_EMAILS: '*' })).toThrow(/ADMIN_EMAILS/);
    expect(() => loadConfig({ ...testEnv, ALLOWED_EMAILS: '*', ADMIN_EMAILS: ALLOWED })).toThrow(/CONTACT_EMAIL/);
    const cfg = loadConfig({ ...testEnv, ...OPEN_ENV });
    expect(cfg.openSignup).toBe(true);
    expect([...cfg.adminEmails]).toEqual([ALLOWED]);
  });
});

describe('사용자별 달력', () => {
  it('다른 사용자의 메모·이력·내보내기·기기를 볼 수 없고, 변경 번호도 따로 센다', async () => {
    t = await startTestServer(OPEN_ENV);
    const a = await t.token('A', ALLOWED);
    const b = await t.token('B', 'other@example.com');

    const ra = (await push(a, [{ opId: uuid(), date: '2026-06-01', baseVersion: 0, content: 'A의 비밀' }])).json().results[0];
    expect(ra.status).toBe('applied');
    // B 는 같은 날짜에 자기 메모를 따로 쓴다 (version 1 부터, seq 1 부터)
    const rb = (await push(b, [{ opId: uuid(), date: '2026-06-01', baseVersion: 0, content: 'B 메모' }])).json().results[0];
    expect(rb.status).toBe('applied');
    expect(rb.note.version).toBe(1);
    expect(rb.seq).toBe(1);

    const pb = (await get(b, '/api/sync/pull?since=0')).json();
    expect(pb.notes.map((n: any) => n.content)).toEqual(['B 메모']);
    expect(pb.lastSeq).toBe(1);
    const pa = (await get(a, '/api/sync/pull?since=0')).json();
    expect(pa.notes.map((n: any) => n.content)).toEqual(['A의 비밀']);

    const hb = (await get(b, '/api/notes/2026-06-01/history')).json().history;
    expect(hb.map((x: any) => x.content)).toEqual(['B 메모']);
    const eb = (await get(b, '/api/export')).json();
    expect(JSON.stringify(eb)).not.toContain('A의 비밀');

    // 기기 목록에는 자기 기기만, 남의 기기는 폐기할 수 없다
    const db = (await get(b, '/api/devices')).json().devices;
    expect(db.map((d: any) => d.name)).toEqual(['B']);
    const da = (await get(a, '/api/devices')).json().devices;
    const devA = da.find((d: any) => d.name === 'A');
    const del = await t.app.inject({ method: 'DELETE', url: `/api/devices/${devA.id}`, headers: bearer(b) });
    expect(del.statusCode).toBe(404);
    expect((await get(a, '/api/me')).statusCode).toBe(200);
  });

  it('남의 opId 를 다시 보내도 그 응답을 얻을 수 없다', async () => {
    t = await startTestServer(OPEN_ENV);
    const a = await t.token('A', ALLOWED);
    const b = await t.token('B', 'other@example.com');
    const opId = uuid();
    await push(a, [{ opId, date: '2026-06-02', baseVersion: 0, content: 'A 내용' }]);
    const r = (await push(b, [{ opId, date: '2026-06-02', baseVersion: 0, content: 'x' }])).json().results[0];
    expect(r.status).toBe('rejected');
    expect(JSON.stringify(r)).not.toContain('A 내용');
  });

  it('실시간 이벤트는 그 사용자의 기기에만 간다', async () => {
    t = await startTestServer(OPEN_ENV);
    const a = await t.token('A', ALLOWED);
    const b = await t.token('B', 'other@example.com');
    const wsUrl = t.url.replace('http', 'ws') + '/api/ws';
    const open = async (tok: string) => {
      const { ticket } = (await t!.app.inject({ method: 'POST', url: '/api/ws-ticket', headers: bearer(tok) })).json();
      const msgs: any[] = [];
      const ws = new WebSocket(`${wsUrl}?ticket=${ticket}`);
      ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
      await new Promise((r) => ws.on('open', r));
      return { ws, msgs };
    };
    const sa = await open(a);
    const sb = await open(b);
    await push(a, [{ opId: uuid(), date: '2026-06-03', baseVersion: 0, content: 'A 실시간' }]);
    await new Promise((r) => setTimeout(r, 200));
    expect(sa.msgs.some((m) => m.type === 'note')).toBe(true);
    expect(sb.msgs.some((m) => m.type === 'note')).toBe(false);
    sa.ws.close();
    sb.ws.close();
  });

  it('클라이언트가 기대한 계정과 토큰의 계정이 다르면 409', async () => {
    t = await startTestServer(OPEN_ENV);
    const a = await t.token('A', ALLOWED);
    const ok = await t.app.inject({ method: 'GET', url: '/api/me', headers: { ...bearer(a), 'x-deskcal-user': ALLOWED } });
    expect(ok.statusCode).toBe(200);
    const bad = await t.app.inject({ method: 'GET', url: '/api/me', headers: { ...bearer(a), 'x-deskcal-user': 'other@example.com' } });
    expect(bad.statusCode).toBe(409);
  });

  it('허용 목록에서 빠진 이메일의 토큰은 더 이상 쓸 수 없다', async () => {
    t = await startTestServer();
    const stranger = await t.token('S', 'removed@example.com');
    expect((await get(stranger, '/api/me')).statusCode).toBe(401);
  });

  it('계정을 삭제하면 달력·이력·기기가 모두 사라진다', async () => {
    t = await startTestServer(OPEN_ENV);
    const a = await t.token('A', ALLOWED);
    const b = await t.token('B', 'other@example.com');
    await push(b, [{ opId: uuid(), date: '2026-06-04', baseVersion: 0, content: '지울 메모' }]);
    await push(a, [{ opId: uuid(), date: '2026-06-04', baseVersion: 0, content: '남을 메모' }]);
    const wrong = await t.app.inject({ method: 'DELETE', url: '/api/account', headers: bearer(b), payload: { email: 'x@example.com' } });
    expect(wrong.statusCode).toBe(400);
    const del = await t.app.inject({ method: 'DELETE', url: '/api/account', headers: bearer(b), payload: { email: 'other@example.com' } });
    expect(del.statusCode).toBe(200);
    expect((await get(b, '/api/me')).statusCode).toBe(401);

    const conn = await mysql.createConnection(t.cfg.db);
    const [[u]] = await conn.query<any[]>("SELECT COUNT(*) AS n FROM users WHERE email = 'other@example.com'");
    const [notes] = await conn.query<any[]>('SELECT content FROM notes');
    const [hist] = await conn.query<any[]>('SELECT content FROM note_history');
    await conn.end();
    expect(Number(u.n)).toBe(0);
    expect(notes.map((n) => n.content)).toEqual(['남을 메모']);
    expect(hist.map((n) => n.content)).toEqual(['남을 메모']);
  });
});

describe('누구나 가입', () => {
  it('처음 보는 Google 계정도 로그인하면 빈 달력이 생긴다. 인원이 차면 거부', async () => {
    t = await startTestServer({ ...OPEN_ENV, MAX_USERS: '2' });
    // 주인(ALLOWED)은 시작할 때 기존 달력을 넘겨받아 이미 1명
    const r1 = await webLogin('new1@example.com');
    expect(r1.statusCode).toBe(302);
    const session = cookieOf(r1.headers['set-cookie'], 'dc_session')!.split(';')[0];
    const me = (await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: session } })).json();
    expect(me.email).toBe('new1@example.com');
    expect(me.admin).toBe(false);
    expect(me.quota).toBeGreaterThan(0);
    const pull = (await t.app.inject({ method: 'GET', url: '/api/sync/pull?since=0', headers: { cookie: session } })).json();
    expect(pull.notes).toEqual([]);

    const r2 = await webLogin('new2@example.com', '203.0.113.51');
    expect(r2.statusCode).toBe(403);
    expect(r2.body).toContain('새 사용자를 받을 수 없습니다');
    // 이미 가입한 사람은 인원이 차도 다시 로그인할 수 있다
    const again = await webLogin('new1@example.com', '203.0.113.52');
    expect(again.statusCode).toBe(302);
  });

  it('관리자가 아니면 임시공휴일을 추가할 수 없고, 가져오기로도 넣을 수 없다', async () => {
    t = await startTestServer(OPEN_ENV);
    const u = await t.token('U', 'user@example.com');
    const add = await t.app.inject({ method: 'POST', url: '/api/holidays', headers: bearer(u), payload: { date: '2026-12-30', name: '가짜' } });
    expect(add.statusCode).toBe(403);
    const imp = await t.app.inject({
      method: 'POST',
      url: '/api/import',
      headers: bearer(u),
      payload: { format: 'deskcal-export', notes: [], customHolidays: [{ date: '2026-12-30', name: '가짜' }] },
    });
    expect(imp.json().holidays).toBe(0);
    const hol = (await get(u, '/api/holidays')).json().holidays;
    expect(hol.find((h: any) => h.date === '2026-12-30')).toBeUndefined();
  });

  it('소개·개인정보처리방침·이용약관은 로그인 없이 볼 수 있다 (Google OAuth 앱 인증 요건)', async () => {
    t = await startTestServer({ ...OPEN_ENV, GOOGLE_SITE_VERIFICATION: 'google0123456789abcdef.html' });
    const privacy = await t.app.inject({ method: 'GET', url: '/privacy' });
    expect(privacy.statusCode).toBe(200);
    expect(privacy.headers['content-type']).toMatch(/text\/html/);
    expect(privacy.body).toContain('contact@example.com');
    expect(privacy.body).toContain('openid');
    expect(privacy.body).toContain('Limited Use');
    const about = await t.app.inject({ method: 'GET', url: '/about' });
    expect(about.statusCode).toBe(200);
    expect(about.body).toContain('href="/privacy"');
    expect(about.body).not.toContain('login-btn'); // 로그인 화면이 아니다
    const terms = await t.app.inject({ method: 'GET', url: '/terms' });
    expect(terms.statusCode).toBe(200);
    const css = await t.app.inject({ method: 'GET', url: '/pages.css' });
    expect(css.headers['content-type']).toMatch(/text\/css/);
    const verify = await t.app.inject({ method: 'GET', url: '/google0123456789abcdef.html' });
    expect(verify.body).toBe('google-site-verification: google0123456789abcdef.html');
    expect(() => loadConfig({ ...testEnv, GOOGLE_SITE_VERIFICATION: '../etc/passwd' })).toThrow(/GOOGLE_SITE_VERIFICATION/);
  });
});

describe('용량·속도 제한 (관리자가 아닌 사용자)', () => {
  const big = (ch: string) => ch.repeat(60 * 1024);

  it('메모가 한도를 넘으면 늘리는 저장은 거부하고, 줄이는 저장은 받는다. 관리자는 제한 없음', async () => {
    t = await startTestServer({ ...OPEN_ENV, USER_QUOTA_MB: '1' });
    const u = await t.token('U', 'user@example.com');
    const statuses: string[] = [];
    for (let i = 1; i <= 18; i++) {
      const date = `2026-07-${String(i).padStart(2, '0')}`;
      statuses.push((await push(u, [{ opId: uuid(), date, baseVersion: 0, content: big('a') }])).json().results[0].status);
    }
    expect(statuses.slice(0, 16).every((s) => s === 'applied')).toBe(true);
    const rejected = statuses.indexOf('rejected');
    expect(rejected).toBeGreaterThan(0);
    const last = (await push(u, [{ opId: uuid(), date: '2026-07-30', baseVersion: 0, content: big('z') }])).json().results[0];
    expect(last.status).toBe('rejected');
    expect(last.error).toMatch(/저장 공간/);
    // 지우는 저장은 된다
    const del = (await push(u, [{ opId: uuid(), date: '2026-07-01', baseVersion: 1, content: '' }])).json().results[0];
    expect(del.status).toBe('applied');

    const me = (await get(u, '/api/me')).json();
    expect(me.usage.noteBytes).toBeLessThanOrEqual(1024 * 1024);
    expect(me.usage.historyBytes).toBeLessThanOrEqual(1024 * 1024);

    // 관리자는 한도가 없다
    const admin = await t.token('ADMIN', ALLOWED);
    for (let i = 1; i <= 18; i++) {
      const date = `2026-08-${String(i).padStart(2, '0')}`;
      expect((await push(admin, [{ opId: uuid(), date, baseVersion: 0, content: big('b') }])).json().results[0].status).toBe('applied');
    }
  });

  it('이력이 한도를 넘으면 오래된 이력부터 지워 한도 안에 머문다', async () => {
    t = await startTestServer({ ...OPEN_ENV, USER_QUOTA_MB: '1' });
    const u = await t.token('U', 'user@example.com');
    let v = 0;
    for (let i = 0; i < 25; i++) {
      const r = (await push(u, [{ opId: uuid(), date: '2026-09-01', baseVersion: v, content: big(String.fromCharCode(97 + (i % 26))) }])).json().results[0];
      expect(r.status).toBe('applied');
      v = r.note.version;
    }
    const me = (await get(u, '/api/me')).json();
    expect(me.usage.historyBytes).toBeLessThanOrEqual(1024 * 1024);
    const conn = await mysql.createConnection(t.cfg.db);
    const [[s]] = await conn.query<any[]>('SELECT SUM(LENGTH(content) + 100) AS b, COUNT(*) AS n FROM note_history');
    await conn.end();
    expect(Number(s.b)).toBe(me.usage.historyBytes); // 기록한 사용량과 실제가 같다
    expect(Number(s.n)).toBeLessThan(25);
    // 최신 이력은 남아 있다
    const h = (await get(u, '/api/notes/2026-09-01/history')).json().history;
    expect(h[0].version).toBe(v);
  });

  it('1분에 보낼 수 있는 op 수를 넘으면 429', async () => {
    t = await startTestServer({ ...OPEN_ENV, OPS_PER_MINUTE: '5' });
    const u = await t.token('U', 'user@example.com');
    const ops = (n: number) => Array.from({ length: n }, (_, i) => ({ opId: uuid(), date: `2026-10-0${i + 1}`, baseVersion: 0, content: 'x' }));
    expect((await push(u, ops(4))).statusCode).toBe(200);
    expect((await push(u, ops(4))).statusCode).toBe(429);
    // 관리자는 제한 없음
    const admin = await t.token('ADMIN', ALLOWED);
    expect((await push(admin, ops(9))).statusCode).toBe(200);
  });
});

describe('기존 달력 넘겨받기 (002 마이그레이션)', () => {
  it('예전 데이터는 주인 이메일 사용자 것이 되고, 기존 토큰과 변경 번호가 그대로 이어진다', async () => {
    const cfg = loadConfig({ ...testEnv, ...OPEN_ENV });
    await resetDb(cfg);
    await migrate(cfg, '001');
    const token = 'legacy-token-' + crypto.randomBytes(16).toString('hex');
    const conn = await mysql.createConnection(cfg.db);
    await conn.query(
      "INSERT INTO devices (email, name, kind, token_hash, created_at, last_used_at) VALUES (?, '예전 PC', 'desktop', ?, NOW(3), NOW(3))",
      [ALLOWED, sha256(token)],
    );
    await conn.query(
      "INSERT INTO notes (date, content, color, version, conflict, updated_at) VALUES ('2026-01-05', '예전 메모', 'red', 2, 0, NOW(3))",
    );
    for (const [seq, v] of [[1, 1], [2, 2]]) {
      await conn.query("INSERT INTO changes (seq, date, version, created_at) VALUES (?, '2026-01-05', ?, NOW(3))", [seq, v]);
      await conn.query("INSERT INTO note_history (date, version, content, reason, created_at) VALUES ('2026-01-05', ?, '예전 메모', 'edit', NOW(3))", [v]);
    }
    await conn.end();

    await migrate(cfg);
    const pool = createPool(cfg);
    const built = await buildApp({ cfg, pool, google: fakeGoogle, logger: false });
    try {
      const me = await built.app.inject({ method: 'GET', url: '/api/me', headers: bearer(token) });
      expect(me.statusCode).toBe(200);
      expect(me.json().email).toBe(ALLOWED);
      const pull = (await built.app.inject({ method: 'GET', url: '/api/sync/pull?since=0', headers: bearer(token) })).json();
      expect(pull.lastSeq).toBe(2); // 클라이언트 캐시의 since 가 그대로 유효
      expect(pull.notes).toMatchObject([{ date: '2026-01-05', content: '예전 메모', color: 'red', version: 2 }]);
      const r = (
        await built.app.inject({
          method: 'POST',
          url: '/api/sync/push',
          headers: bearer(token),
          payload: { ops: [{ opId: uuid(), date: '2026-01-05', baseVersion: 2, content: '이어서' }] },
        })
      ).json().results[0];
      expect(r.seq).toBe(3);
      const hist = (await built.app.inject({ method: 'GET', url: '/api/notes/2026-01-05/history', headers: bearer(token) })).json().history;
      expect(hist.length).toBe(3);
      // 다른 사람이 새로 가입해도 주인 달력은 보이지 않는다
      const other = (await built.devices.create((await built.users.findOrCreate('new@example.com', Infinity))!, 'N', 'web', '127.0.0.1')).token;
      const op = (await built.app.inject({ method: 'GET', url: '/api/sync/pull?since=0', headers: bearer(other) })).json();
      expect(op.notes).toEqual([]);
    } finally {
      await built.app.close();
      await pool.end();
    }
  });
});
