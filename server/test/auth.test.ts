import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import { loadConfig } from '../src/config.js';
import { pkceChallenge, sha256 } from '../src/auth.js';
import { PUBLIC_URL, startTestServer, testEnv, type TestCtx } from './helpers.js';

let t: TestCtx;
beforeAll(async () => {
  t = await startTestServer();
});
afterAll(async () => t?.close());

const cookieOf = (setCookie: string | string[] | undefined, name: string) => {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return arr.find((c) => c.startsWith(name + '='));
};

/** 웹 로그인 흐름을 끝까지 진행하고 응답을 돌려준다 */
async function webLogin(code: string, ip = '203.0.113.10') {
  const start = await t.app.inject({ method: 'GET', url: '/auth/google/start', headers: { 'x-forwarded-for': ip } });
  expect(start.statusCode).toBe(302);
  const state = new URL(start.headers.location as string).searchParams.get('state')!;
  const oauth = cookieOf(start.headers['set-cookie'], 'dc_oauth')!.split(';')[0];
  return t.app.inject({
    method: 'GET',
    url: `/auth/google/callback?state=${state}&code=${encodeURIComponent(code)}`,
    headers: { cookie: oauth, 'x-forwarded-for': ip },
  });
}

describe('설정 검증', () => {
  it('ALLOWED_EMAILS 가 없으면 시작하지 않는다', () => {
    expect(() => loadConfig({ ...testEnv, ALLOWED_EMAILS: '' })).toThrow(/ALLOWED_EMAILS/);
  });
  it('0.0.0.0 바인딩을 거부한다', () => {
    expect(() => loadConfig({ ...testEnv, HOST: '0.0.0.0' })).toThrow(/0\.0\.0\.0/);
  });
  it('금지된 포트를 거부한다', () => {
    expect(() => loadConfig({ ...testEnv, PORT: '8080' })).toThrow(/8080/);
  });
});

describe('인증 필수', () => {
  it('토큰 없이 API 호출 시 401', async () => {
    for (const url of ['/api/me', '/api/sync/pull?since=0', '/api/holidays', '/api/export', '/api/devices']) {
      const r = await t.app.inject({ method: 'GET', url });
      expect(r.statusCode, url).toBe(401);
    }
    const p = await t.app.inject({ method: 'POST', url: '/api/sync/push', payload: { ops: [] } });
    expect(p.statusCode).toBe(401);
  });

  it('잘못된 토큰은 401', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/api/me', headers: { authorization: 'Bearer nope' } });
    expect(r.statusCode).toBe(401);
  });

  it('WebSocket 은 handshake 에서 티켓을 검사한다', async () => {
    const wsUrl = t.url.replace('http', 'ws') + '/api/ws';
    const status = await new Promise<number>((resolve) => {
      const ws = new WebSocket(wsUrl + '?ticket=bogus');
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      ws.on('open', () => resolve(101));
    });
    expect(status).toBe(401);

    const token = await t.token();
    const { ticket } = (
      await t.app.inject({ method: 'POST', url: '/api/ws-ticket', headers: { authorization: `Bearer ${token}` } })
    ).json();
    const hello = await new Promise<any>((resolve, reject) => {
      const ws = new WebSocket(`${wsUrl}?ticket=${ticket}`);
      ws.on('message', (d) => {
        resolve(JSON.parse(String(d)));
        ws.close();
      });
      ws.on('unexpected-response', () => reject(new Error('rejected')));
    });
    expect(hello.type).toBe('hello');
    // 티켓은 일회용
    const again = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${wsUrl}?ticket=${ticket}`);
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      ws.on('open', () => resolve(101));
    });
    expect(again).toBe(401);
  });

  it('허용되지 않은 Origin 의 WebSocket 은 거부', async () => {
    const token = await t.token();
    const { ticket } = (
      await t.app.inject({ method: 'POST', url: '/api/ws-ticket', headers: { authorization: `Bearer ${token}` } })
    ).json();
    const status = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${t.url.replace('http', 'ws')}/api/ws?ticket=${ticket}`, { origin: 'https://evil.example' });
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      ws.on('open', () => resolve(101));
    });
    expect(status).toBe(403);
  });
});

describe('Google 로그인 (웹)', () => {
  it('허용된 이메일은 로그인되고 HttpOnly/Secure/SameSite=Strict 쿠키를 받는다', async () => {
    const r = await webLogin('ok:me@example.com');
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe('/');
    const c = cookieOf(r.headers['set-cookie'], 'dc_session')!;
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/Secure/);
    expect(c).toMatch(/SameSite=Strict/);
    const session = c.split(';')[0];
    const me = await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: session } });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe('me@example.com');

    // DB 에는 해시만 저장된다
    const token = session.split('=')[1];
    const conn = await (await import('mysql2/promise')).createConnection(t.cfg.db);
    const [rows] = await conn.query<any[]>('SELECT token_hash FROM devices');
    await conn.end();
    const hashes = rows.map((x: any) => x.token_hash);
    expect(hashes).toContain(sha256(token));
    expect(hashes).not.toContain(token);
  });

  it('쿠키 인증 + 상태 변경 요청은 Origin 이 맞아야 한다 (CSRF)', async () => {
    const r = await webLogin('ok:me@example.com', '203.0.113.11');
    const session = cookieOf(r.headers['set-cookie'], 'dc_session')!.split(';')[0];
    const noOrigin = await t.app.inject({ method: 'POST', url: '/api/ws-ticket', headers: { cookie: session } });
    expect(noOrigin.statusCode).toBe(403);
    const evil = await t.app.inject({ method: 'POST', url: '/api/ws-ticket', headers: { cookie: session, origin: 'https://evil.example' } });
    expect(evil.statusCode).toBe(403);
    const ok = await t.app.inject({ method: 'POST', url: '/api/ws-ticket', headers: { cookie: session, origin: PUBLIC_URL } });
    expect(ok.statusCode).toBe(200);
  });

  it('브라우저 바인딩 쿠키 없이 callback 하면 거부', async () => {
    const start = await t.app.inject({ method: 'GET', url: '/auth/google/start', headers: { 'x-forwarded-for': '203.0.113.12' } });
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const r = await t.app.inject({ method: 'GET', url: `/auth/google/callback?state=${state}&code=ok:me@example.com`, headers: { 'x-forwarded-for': '203.0.113.12' } });
    expect(r.statusCode).toBe(403);
  });

  it('허용 목록에 없는 이메일은 거부하고, IP 별 5회 실패 시 15분 잠근다 (X-Forwarded-For 기준)', async () => {
    const ip = '198.51.100.7';
    for (let i = 0; i < 5; i++) {
      const r = await webLogin('ok:stranger@example.com', ip);
      expect(r.statusCode).toBe(403);
    }
    const locked = await t.app.inject({ method: 'GET', url: '/auth/google/start', headers: { 'x-forwarded-for': ip } });
    expect(locked.statusCode).toBe(429);
    // 다른 IP 는 영향 없음
    const other = await t.app.inject({ method: 'GET', url: '/auth/google/start', headers: { 'x-forwarded-for': '198.51.100.8' } });
    expect(other.statusCode).toBe(302);
    // 클라이언트가 XFF 앞쪽을 위조해도 프록시가 붙인 마지막 값으로 판단
    const spoof = await t.app.inject({ method: 'GET', url: '/auth/google/start', headers: { 'x-forwarded-for': `1.2.3.4, ${ip}` } });
    expect(spoof.statusCode).toBe(429);
  });
});

describe('Google 로그인 (데스크톱, 루프백 + PKCE)', () => {
  async function desktopFlow(verifier: string) {
    const challenge = pkceChallenge(verifier);
    const start = await t.app.inject({
      method: 'GET',
      url: `/auth/google/start?client=desktop&port=45678&challenge=${challenge}&name=${encodeURIComponent('내 PC')}`,
      headers: { 'x-forwarded-for': '203.0.113.20' },
    });
    expect(start.statusCode).toBe(302);
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const oauth = cookieOf(start.headers['set-cookie'], 'dc_oauth')!.split(';')[0];
    const cb = await t.app.inject({
      method: 'GET',
      url: `/auth/google/callback?state=${state}&code=ok:me@example.com`,
      headers: { cookie: oauth, 'x-forwarded-for': '203.0.113.20' },
    });
    expect(cb.statusCode).toBe(302);
    const loc = new URL(cb.headers.location as string);
    expect(loc.origin).toBe('http://127.0.0.1:45678');
    return loc.searchParams.get('code')!;
  }

  it('올바른 verifier 로만 토큰을 받는다', async () => {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const code = await desktopFlow(verifier);
    const bad = await t.app.inject({ method: 'POST', url: '/api/auth/desktop/exchange', payload: { code, verifier: 'x'.repeat(43) } });
    expect(bad.statusCode).toBe(400);
    // 코드는 일회용이라 실패 후 재사용 불가 → 새로 받는다
    const code2 = await desktopFlow(verifier);
    const ok = await t.app.inject({ method: 'POST', url: '/api/auth/desktop/exchange', payload: { code: code2, verifier } });
    expect(ok.statusCode).toBe(200);
    const { token } = ok.json();
    expect(token.length).toBeGreaterThanOrEqual(43);
    const me = await t.app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `Bearer ${token}` } });
    expect(me.json().device.name).toBe('내 PC');
  });
});

describe('기기 토큰 관리', () => {
  it('기기 목록 조회 후 폐기하면 그 토큰은 더 이상 쓸 수 없다', async () => {
    const a = await t.token('A');
    const b = await t.token('B');
    const list = (await t.app.inject({ method: 'GET', url: '/api/devices', headers: { authorization: `Bearer ${a}` } })).json();
    const devB = list.devices.find((d: any) => d.name === 'B');
    expect(devB).toBeTruthy();
    const del = await t.app.inject({ method: 'DELETE', url: `/api/devices/${devB.id}`, headers: { authorization: `Bearer ${a}` } });
    expect(del.statusCode).toBe(200);
    const me = await t.app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `Bearer ${b}` } });
    expect(me.statusCode).toBe(401);
  });

  it('90일 동안 안 쓴 토큰은 만료', async () => {
    const tok = await t.token('old');
    const conn = await (await import('mysql2/promise')).createConnection(t.cfg.db);
    await conn.query('UPDATE devices SET last_used_at = NOW(3) - INTERVAL 91 DAY WHERE token_hash = ?', [sha256(tok)]);
    await conn.end();
    const me = await t.app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `Bearer ${tok}` } });
    expect(me.statusCode).toBe(401);
  });
});

describe('보안 헤더 / CORS / 요청 크기', () => {
  it('Android 앱 연결용 assetlinks.json 은 인증 없이 제공', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/.well-known/assetlinks.json' });
    expect(r.statusCode).toBe(200);
    const [link] = r.json();
    expect(link.target.package_name).toBe('io.github.toddla23.batangcalendar');
    expect(link.target.sha256_cert_fingerprints[0]).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  it('보안 헤더가 붙는다', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/healthz' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
  });

  it('CORS 는 Tauri 출처만 허용', async () => {
    const ok = await t.app.inject({ method: 'OPTIONS', url: '/api/me', headers: { origin: 'http://tauri.localhost', 'access-control-request-method': 'GET' } });
    expect(ok.statusCode).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe('http://tauri.localhost');
    const bad = await t.app.inject({ method: 'OPTIONS', url: '/api/me', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
    expect(bad.statusCode).toBe(403);
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('메모 한 칸 64KB 초과는 거부', async () => {
    const tok = await t.token();
    const r = await t.app.inject({
      method: 'POST',
      url: '/api/sync/push',
      headers: { authorization: `Bearer ${tok}` },
      payload: { ops: [{ opId: crypto.randomUUID(), date: '2026-01-01', baseVersion: 0, content: '가'.repeat(22 * 1024) }] },
    });
    expect(r.json().results[0].status).toBe('rejected');
  });

  it('가져오기 파일은 10MB 까지', async () => {
    const tok = await t.token();
    const r = await t.app.inject({
      method: 'POST',
      url: '/api/import',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ format: 'deskcal-export', notes: [], pad: 'x'.repeat(11 * 1024 * 1024) }),
    });
    expect(r.statusCode).toBe(413);
  });
});
