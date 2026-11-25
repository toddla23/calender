import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { pkceChallenge } from '../src/auth.js';
import { WIDGET_PREVIEW_CHARS } from '../src/protocol.js';
import { startTestServer, type TestCtx } from './helpers.js';

// Android 위젯 (F19): 앱에서 넘겨받는 연결(D-025)과 범위 조회(D-023)

let t: TestCtx;
beforeAll(async () => {
  t = await startTestServer({ ALLOWED_EMAILS: 'me@example.com,other@example.com' });
});
afterAll(async () => t?.close());

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const newVerifier = () => crypto.randomBytes(32).toString('base64url');

async function linkCode(token: string, verifier: string) {
  const r = await t.app.inject({ method: 'POST', url: '/api/widget/link', headers: bearer(token), payload: { challenge: pkceChallenge(verifier) } });
  expect(r.statusCode).toBe(200);
  return r.json().code as string;
}

async function push(token: string, date: string, content?: string, color?: string | null) {
  const r = await t.app.inject({
    method: 'POST',
    url: '/api/sync/push',
    headers: bearer(token),
    payload: { ops: [{ opId: crypto.randomUUID(), date, baseVersion: 0, ...(content !== undefined && { content }), ...(color !== undefined && { color }) }] },
  });
  expect(r.json().results[0].status).toBe('applied');
}

describe('위젯 연결', () => {
  it('로그인해야 연결 코드를 만들 수 있고, challenge 형식을 검사한다', async () => {
    const noAuth = await t.app.inject({ method: 'POST', url: '/api/widget/link', payload: { challenge: pkceChallenge(newVerifier()) } });
    expect(noAuth.statusCode).toBe(401);
    const tok = await t.token('폰');
    const bad = await t.app.inject({ method: 'POST', url: '/api/widget/link', headers: bearer(tok), payload: { challenge: 'short' } });
    expect(bad.statusCode).toBe(400);
  });

  it('올바른 verifier 로만 위젯 토큰을 받고, 코드는 한 번만 쓴다', async () => {
    const tok = await t.token('폰');
    const verifier = newVerifier();
    const code = await linkCode(tok, verifier);
    const bad = await t.app.inject({ method: 'POST', url: '/api/auth/widget/exchange', payload: { code, verifier: newVerifier() } });
    expect(bad.statusCode).toBe(400);
    const reuse = await t.app.inject({ method: 'POST', url: '/api/auth/widget/exchange', payload: { code, verifier } });
    expect(reuse.statusCode).toBe(400);

    const code2 = await linkCode(tok, verifier);
    const ok = await t.app.inject({ method: 'POST', url: '/api/auth/widget/exchange', payload: { code: code2, verifier } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().email).toBe('me@example.com');
    const me = (await t.app.inject({ method: 'GET', url: '/api/me', headers: bearer(ok.json().token) })).json();
    expect(me.device).toMatchObject({ name: 'Android 위젯', kind: 'widget' });
  });

  it('위젯 코드는 데스크톱 교환에 쓸 수 없다', async () => {
    const tok = await t.token('폰');
    const verifier = newVerifier();
    const code = await linkCode(tok, verifier);
    const r = await t.app.inject({ method: 'POST', url: '/api/auth/desktop/exchange', payload: { code, verifier } });
    expect(r.statusCode).toBe(400);
  });
});

describe('위젯 범위 조회', () => {
  it('범위 안의 내 메모 앞부분과 공휴일만 준다', async () => {
    const me = await t.token('폰');
    const other = await t.token('남의 폰', 'other@example.com');
    const long = '가'.repeat(WIDGET_PREVIEW_CHARS + 50);
    await push(me, '2026-01-05', long);
    await push(me, '2026-01-06', undefined, 'blue'); // 색만 있는 칸
    await push(me, '2026-01-07', ''); // 빈 칸은 빠진다
    await push(me, '2026-03-01', '범위 밖');
    await push(other, '2026-01-08', '남의 메모');

    const r = await t.app.inject({ method: 'GET', url: '/api/widget?from=2026-01-01&to=2026-01-31', headers: bearer(me) });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.notes.map((n: any) => n.date)).toEqual(['2026-01-05', '2026-01-06']);
    expect(body.notes[0].text).toBe('가'.repeat(WIDGET_PREVIEW_CHARS));
    expect(body.notes[1]).toMatchObject({ text: '', color: 'blue', conflict: false });
    expect(body.holidays.length).toBeGreaterThan(0);
    expect(body.holidays.every((h: any) => h.date >= '2026-01-01' && h.date <= '2026-01-31')).toBe(true);
  });

  it('잘못된 범위는 400', async () => {
    const tok = await t.token('폰');
    for (const q of ['from=2026-01-10&to=2026-01-01', 'from=2026-01-01&to=2026-03-15', 'from=2026-02-30&to=2026-03-01', 'from=2026-01-01']) {
      const r = await t.app.inject({ method: 'GET', url: `/api/widget?${q}`, headers: bearer(tok) });
      expect(r.statusCode, q).toBe(400);
    }
    const unauth = await t.app.inject({ method: 'GET', url: '/api/widget?from=2026-01-01&to=2026-01-31' });
    expect(unauth.statusCode).toBe(401);
  });
});
