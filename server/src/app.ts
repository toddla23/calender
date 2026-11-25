import fs from 'node:fs';
import path from 'node:path';
import Fastify, { LogController, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import type { Pool } from 'mysql2/promise';
import { isAllowedEmail, type Config } from './config.js';
import {
  DeviceStore,
  EphemeralStore,
  LoginLimiter,
  OAUTH_COOKIE,
  OpLimiter,
  SESSION_COOKIE,
  clientIp,
  createGoogleAuth,
  deviceNameFromUA,
  pkceChallenge,
  randomToken,
  safeEqual,
  sha256,
  type Device,
  type GoogleAuth,
} from './auth.js';
import { SyncService } from './sync.js';
import { HolidayService } from './holidays.js';
import { MAX_OPS_PER_PUSH, WIDGET_MAX_DAYS, WIDGET_PREVIEW_CHARS, isValidDate, type Op, type ServerEvent, type WidgetResponse } from './protocol.js';
import { registerDataRoutes } from './dataRoutes.js';
import { UserStore, type User } from './users.js';
import { privacyPage } from './privacy.js';
import { PAGES_CSS, aboutPage, termsPage } from './pages.js';
import { adminStats } from './admin.js';

declare module 'fastify' {
  interface FastifyRequest {
    device?: Device;
    viaCookie?: boolean;
  }
}

export interface AppOptions {
  cfg: Config;
  pool: Pool;
  google?: GoogleAuth;
  logger?: boolean;
}

export interface App {
  app: FastifyInstance;
  sync: SyncService;
  devices: DeviceStore;
  users: UserStore;
  hub: Hub;
}

/** 연결된 WebSocket 관리 및 방송 */
export class Hub {
  private sockets = new Map<WebSocket, { deviceId: number; userId: number }>();
  add(ws: WebSocket, device: { id: number; userId: number }) {
    this.sockets.set(ws, { deviceId: device.id, userId: device.userId });
    ws.on('close', () => this.sockets.delete(ws));
  }
  /** 모든 사용자에게 (공휴일 등 공통 데이터) */
  broadcast(ev: ServerEvent) {
    const data = JSON.stringify(ev);
    for (const ws of this.sockets.keys()) if (ws.readyState === 1) ws.send(data);
  }
  /** 그 사용자의 기기에만 */
  sendToUser(userId: number, ev: ServerEvent) {
    const data = JSON.stringify(ev);
    for (const [ws, s] of this.sockets) if (s.userId === userId && ws.readyState === 1) ws.send(data);
  }
  closeDevice(deviceId: number) {
    for (const [ws, s] of this.sockets) if (s.deviceId === deviceId) ws.close(4001, 'revoked');
  }
  closeUser(userId: number) {
    for (const [ws, s] of this.sockets) if (s.userId === userId) ws.close(4001, 'deleted');
  }
  pingAll() {
    for (const ws of this.sockets.keys()) {
      const w = ws as WebSocket & { alive?: boolean };
      if (w.alive === false) {
        ws.terminate();
        continue;
      }
      w.alive = false;
      ws.ping();
    }
  }
  get size() {
    return this.sockets.size;
  }
}

const COOKIE_MAX_AGE = 400 * 24 * 3600;

function htmlPage(title: string, msg: string) {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body><h2>${esc(title)}</h2><p>${esc(msg)}</p><p><a href="/">달력으로 돌아가기</a></p></body></html>`;
}

export async function buildApp(opts: AppOptions): Promise<App> {
  const { cfg, pool } = opts;
  const publicOrigin = new URL(cfg.publicUrl).origin;
  const wsOrigin = publicOrigin.replace(/^http/, 'ws');

  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level: cfg.logLevel,
            // 비밀번호/토큰/쿠키/쿼리스트링(OAuth code, WS 티켓)은 로그에 남기지 않는다
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            serializers: {
              req: (req) => ({ method: req.method, url: String(req.url).split('?')[0] }),
            },
          },
    bodyLimit: 256 * 1024,
    trustProxy: false,
    logController: new LogController({ disableRequestLogging: true }),
  });

  const google = opts.google ?? createGoogleAuth(cfg);
  const devices = new DeviceStore(pool, cfg.tokenIdleDays);
  const users = new UserStore(pool);
  await users.adoptLegacy(cfg.ownerEmail);
  const limiter = new LoginLimiter();
  const opLimiter = new OpLimiter(cfg.opsPerMinute);
  const hub = new Hub();
  const sync = new SyncService({
    pool,
    historyKeep: cfg.historyKeep,
    onChange: (userId, seq, note) => hub.sendToUser(userId, { type: 'note', seq, note }),
  });
  const holidays = new HolidayService(pool, cfg.holidaysFile);

  type OAuthState = { client: 'web' | 'desktop'; verifier: string; binding: string; port?: number; challenge?: string; name?: string };
  const oauthStates = new EphemeralStore<OAuthState>(10 * 60_000);
  // 데스크톱 로그인(D-003)·위젯 연결(D-025)의 일회용 코드. PKCE challenge 에 묶여 있고 2분 유효
  const linkCodes = new EphemeralStore<{ user: User; challenge: string; name: string; kind: 'desktop' | 'widget' }>(2 * 60_000);
  const isChallenge = (c: unknown): c is string => typeof c === 'string' && /^[A-Za-z0-9_-]{43}$/.test(c);
  const wsTickets = new EphemeralStore<Device>(30_000);

  await app.register(fastifyCookie);
  await app.register(fastifyWebsocket, { options: { maxPayload: 64 * 1024 } });

  // ---------- 공통: 보안 헤더 / CORS ----------
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    `connect-src 'self' ${wsOrigin}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');

  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && origin !== publicOrigin) {
      if (cfg.corsOrigins.has(origin)) {
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Vary', 'Origin');
        if (req.method === 'OPTIONS') {
          reply
            .header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
            .header('Access-Control-Allow-Headers', 'authorization, content-type, x-deskcal-user')
            .header('Access-Control-Max-Age', '600')
            .code(204)
            .send();
          return reply;
        }
      } else if (req.method === 'OPTIONS') {
        reply.code(403).send();
        return reply;
      }
    }
  });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Content-Security-Policy', csp);
    if (publicOrigin.startsWith('https:')) reply.header('Strict-Transport-Security', 'max-age=31536000');
    const url = req.url;
    if (url.startsWith('/api/') || url.startsWith('/auth/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  // ---------- 인증 ----------
  async function authenticate(req: FastifyRequest, reply: FastifyReply) {
    const ip = clientIp(req);
    const authz = req.headers.authorization;
    let token: string | undefined;
    if (authz?.startsWith('Bearer ')) token = authz.slice(7).trim();
    else if (req.cookies[SESSION_COOKIE]) {
      token = req.cookies[SESSION_COOKIE];
      req.viaCookie = true;
    }
    const found = token ? await devices.verify(token, ip) : null;
    // 허용 목록에서 빠진 이메일은 이미 받은 토큰도 쓸 수 없다
    const device = found && isAllowedEmail(cfg, found.email) ? found : null;
    if (!device) {
      if (req.viaCookie) reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return reply.code(401).send({ error: 'unauthorized' });
    }
    // 쿠키 인증 + 상태 변경 요청은 Origin 도 확인 (CSRF 이중 방어)
    if (req.viaCookie && !['GET', 'HEAD'].includes(req.method)) {
      const origin = req.headers.origin;
      if (!origin || !(origin === publicOrigin || cfg.corsOrigins.has(origin))) {
        return reply.code(403).send({ error: 'bad origin' });
      }
    }
    // 클라이언트가 캐시 주인과 다른 계정으로 요청하면 거부한다 (다른 계정 캐시·큐가 섞이지 않게)
    const expectUser = req.headers['x-deskcal-user'];
    if (typeof expectUser === 'string' && expectUser && expectUser !== device.email) {
      return reply.code(409).send({ error: 'account changed' });
    }
    req.device = device;
  }
  const isAdmin = (d?: Device) => !!d && cfg.adminEmails.has(d.email);
  /** 관리자가 아니면 저장 용량 한도를 둔다 */
  const quotaFor = (d: Device) => (isAdmin(d) ? null : cfg.quotaBytes);
  /** 관리자가 아니면 op 속도 제한 */
  const takeOps = (d: Device, n: number) => isAdmin(d) || opLimiter.take(d.userId, n);

  // ---------- 헬스체크 ----------
  app.get('/healthz', async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  // ---------- 공개 페이지: 소개·개인정보처리방침·이용약관 (로그인 없이) ----------
  const publicPage = (path: string, render: (c: Config) => string) =>
    app.get(path, async (_req, reply) => {
      reply.header('Cache-Control', 'no-cache');
      return reply.type('text/html; charset=utf-8').send(render(cfg));
    });
  publicPage('/about', aboutPage);
  publicPage('/privacy', privacyPage);
  publicPage('/terms', termsPage);
  app.get('/pages.css', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=3600');
    return reply.type('text/css; charset=utf-8').send(PAGES_CSS);
  });
  // Google Search Console 소유권 확인 (HTML 파일 방식)
  if (cfg.googleSiteVerification) {
    const name = cfg.googleSiteVerification;
    app.get(`/${name}`, async (_req, reply) =>
      reply.type('text/html; charset=utf-8').send(`google-site-verification: ${name}`),
    );
  }

  // ---------- Android 앱(TWA) 연결 확인 ----------
  app.get('/.well-known/assetlinks.json', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=3600');
    return [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: cfg.android.packageName, sha256_cert_fingerprints: cfg.android.certSha256 },
      },
    ];
  });

  // ---------- Google 로그인 ----------
  app.get('/auth/google/start', async (req, reply) => {
    const ip = clientIp(req);
    if (limiter.isLocked(ip)) {
      return reply.code(429).type('text/html').send(htmlPage('잠시 후 다시 시도하세요', '로그인 실패가 많아 15분 동안 잠겼습니다.'));
    }
    const q = req.query as Record<string, string | undefined>;
    const verifier = randomToken(48);
    const binding = randomToken(24);
    const st: OAuthState = { client: 'web', verifier, binding: sha256(binding) };
    if (q.client === 'desktop') {
      const port = Number(q.port);
      if (!Number.isInteger(port) || port < 1024 || port > 65535 || !isChallenge(q.challenge)) {
        return reply.code(400).type('text/html').send(htmlPage('잘못된 요청', '데스크톱 로그인 매개변수가 올바르지 않습니다.'));
      }
      Object.assign(st, { client: 'desktop', port, challenge: q.challenge, name: (q.name ?? 'Windows 앱').slice(0, 60) });
    }
    const state = oauthStates.put(st);
    reply.setCookie(OAUTH_COOKIE, binding, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax', // Google 에서 돌아오는 최상위 이동에 쿠키가 실려야 하므로 Lax
      path: '/auth/google',
      maxAge: 600,
    });
    return reply.redirect(google.authUrl(state, pkceChallenge(verifier)));
  });

  app.get('/auth/google/callback', async (req, reply) => {
    const ip = clientIp(req);
    const fail = (reason: string, msg: string, email?: string) => {
      limiter.fail(ip);
      req.log.warn({ ip, reason, email }, '로그인 실패');
      return reply.code(403).type('text/html').send(htmlPage('로그인 실패', msg));
    };
    if (limiter.isLocked(ip)) {
      return reply.code(429).type('text/html').send(htmlPage('잠시 후 다시 시도하세요', '로그인 실패가 많아 15분 동안 잠겼습니다.'));
    }
    const q = req.query as Record<string, string | undefined>;
    const st = oauthStates.take(q.state);
    reply.clearCookie(OAUTH_COOKIE, { path: '/auth/google' });
    if (!st) return fail('bad_state', '로그인 요청이 만료됐습니다. 다시 시도하세요.');
    const binding = req.cookies[OAUTH_COOKIE];
    if (!binding || !safeEqual(sha256(binding), st.binding)) return fail('state_mismatch', '로그인을 시작한 브라우저와 다릅니다.');
    if (q.error || !q.code) return fail('google_error', '구글 로그인이 취소됐습니다.');

    let email: string;
    try {
      const r = await google.exchange(q.code, st.verifier);
      if (!r.emailVerified) return fail('email_unverified', '확인되지 않은 이메일입니다.', r.email);
      email = r.email;
    } catch (e) {
      req.log.warn({ err: (e as Error).message }, 'Google 교환 오류');
      return fail('exchange_error', '구글 로그인 처리 중 오류가 났습니다.');
    }
    if (!isAllowedEmail(cfg, email)) return fail('not_allowed', '이 계정은 사용할 수 없습니다.', email);

    limiter.success(ip);
    // 처음 로그인하면 사용자(빈 달력)를 만든다. 누구나 가입이면 인원 한도가 있다.
    const user = await users.findOrCreate(email, cfg.openSignup ? cfg.maxUsers : Infinity);
    if (!user) {
      req.log.warn({ ip, email }, '가입 인원 초과');
      return reply
        .code(403)
        .type('text/html')
        .send(htmlPage('가입할 수 없습니다', '지금은 새 사용자를 받을 수 없습니다. 나중에 다시 시도하세요.'));
    }
    if (st.client === 'desktop') {
      const code = linkCodes.put({ user, challenge: st.challenge!, name: st.name!, kind: 'desktop' });
      req.log.info({ ip, email }, '데스크톱 로그인 코드 발급');
      return reply.redirect(`http://127.0.0.1:${st.port}/callback?code=${encodeURIComponent(code)}`);
    }
    const { token, device } = await devices.create(user, deviceNameFromUA(req.headers['user-agent']), 'web', ip);
    req.log.info({ ip, email, deviceId: device.id }, '웹 로그인');
    reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: COOKIE_MAX_AGE });
    return reply.redirect('/');
  });

  /** 일회용 코드 + PKCE verifier → 기기 토큰. kind 가 맞지 않는 코드는 거부한다 */
  const exchangeRoute = (path: string, kind: 'desktop' | 'widget', logMsg: string) =>
    app.post(path, async (req, reply) => {
      const ip = clientIp(req);
      if (limiter.isLocked(ip)) return reply.code(429).send({ error: 'locked' });
      const b = (req.body ?? {}) as { code?: string; verifier?: string };
      const rec = linkCodes.take(b.code);
      if (!rec || rec.kind !== kind || typeof b.verifier !== 'string' || !safeEqual(pkceChallenge(b.verifier), rec.challenge)) {
        limiter.fail(ip);
        req.log.warn({ ip, reason: `bad_${kind}_code` }, '로그인 실패');
        return reply.code(400).send({ error: 'invalid code' });
      }
      const { token, device } = await devices.create(rec.user, rec.name, kind, ip);
      req.log.info({ ip, email: rec.user.email, deviceId: device.id }, logMsg);
      return { token, device: { id: device.id, name: device.name }, email: rec.user.email };
    });
  exchangeRoute('/api/auth/desktop/exchange', 'desktop', '데스크톱 로그인');
  exchangeRoute('/api/auth/widget/exchange', 'widget', '위젯 연결');

  // ---------- 인증 필요한 API ----------
  await app.register(async (api) => {
    api.addHook('preHandler', authenticate);

    api.get('/api/me', async (req) => ({
      email: req.device!.email,
      device: { id: req.device!.id, name: req.device!.name, kind: req.device!.kind },
      admin: isAdmin(req.device),
      usage: await users.usage(req.device!.userId),
      quota: quotaFor(req.device!),
    }));

    // 계정 삭제: 달력·이력·기기 토큰을 모두 지운다. 실수 방지로 본인 이메일을 다시 받는다.
    api.delete('/api/account', async (req, reply) => {
      const b = (req.body ?? {}) as { email?: string };
      const d = req.device!;
      if (typeof b.email !== 'string' || b.email.trim().toLowerCase() !== d.email) {
        return reply.code(400).send({ error: '확인용 이메일이 맞지 않습니다' });
      }
      await users.delete(d.userId);
      hub.closeUser(d.userId);
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      req.log.info({ userId: d.userId }, '계정 삭제');
      return { ok: true };
    });

    api.post('/api/auth/logout', async (req, reply) => {
      await devices.revoke(req.device!.id, req.device!.userId);
      hub.closeDevice(req.device!.id);
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return { ok: true };
    });

    api.get('/api/devices', async (req) => ({ devices: await devices.list(req.device!.userId), currentId: req.device!.id }));

    api.delete('/api/devices/:id', async (req, reply) => {
      const id = Number((req.params as { id: string }).id);
      if (!Number.isInteger(id)) return reply.code(400).send({ error: 'bad id' });
      const ok = await devices.revoke(id, req.device!.userId);
      if (ok) hub.closeDevice(id);
      req.log.info({ deviceId: id, by: req.device!.id }, '기기 토큰 폐기');
      return ok ? { ok: true } : reply.code(404).send({ error: 'not found' });
    });

    api.post('/api/ws-ticket', async (req) => ({ ticket: wsTickets.put(req.device!) }));

    api.post('/api/sync/push', { bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
      const ops = (req.body as { ops?: Op[] })?.ops;
      if (!Array.isArray(ops) || ops.length > MAX_OPS_PER_PUSH) return reply.code(400).send({ error: 'ops 형식 오류' });
      const d = req.device!;
      if (!takeOps(d, ops.length)) return reply.code(429).send({ error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' });
      const results = [];
      for (const op of ops) results.push(await sync.applyOp(d.userId, op, d.id, { quota: quotaFor(d) }));
      return { results };
    });

    api.get('/api/sync/pull', async (req, reply) => {
      const q = req.query as { since?: string; limit?: string };
      const since = Number(q.since ?? 0);
      const limit = Math.min(Math.max(Number(q.limit ?? 1000), 1), 5000);
      if (!Number.isInteger(since) || since < 0 || !Number.isInteger(limit)) return reply.code(400).send({ error: 'since 오류' });
      return sync.pull(req.device!.userId, since, limit);
    });

    api.get('/api/notes/:date/history', async (req, reply) => {
      const { date } = req.params as { date: string };
      if (!isValidDate(date)) return reply.code(400).send({ error: 'date 오류' });
      return { history: await sync.history(req.device!.userId, date) };
    });

    api.get('/api/holidays', async () => ({ holidays: await holidays.list() }));

    api.post('/api/holidays', async (req, reply) => {
      if (!isAdmin(req.device)) return reply.code(403).send({ error: '관리자만 가능합니다' });
      const b = (req.body ?? {}) as { date?: string; name?: string };
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (!isValidDate(b.date) || !name || name.length > 100) return reply.code(400).send({ error: '날짜/이름 오류' });
      await holidays.addCustom(b.date, name);
      hub.broadcast({ type: 'holidays' });
      return { ok: true };
    });

    api.delete('/api/holidays/:date', async (req, reply) => {
      if (!isAdmin(req.device)) return reply.code(403).send({ error: '관리자만 가능합니다' });
      const { date } = req.params as { date: string };
      if (!isValidDate(date)) return reply.code(400).send({ error: 'date 오류' });
      const ok = await holidays.removeCustom(date);
      hub.broadcast({ type: 'holidays' });
      return ok ? { ok: true } : reply.code(404).send({ error: 'not found' });
    });

    registerDataRoutes(api, { sync, holidays, hub, isAdmin, quotaFor, takeOps });

    // ---------- Android 위젯 (F19) ----------
    // 로그인된 앱(웹)이 위젯 연결 코드를 만든다. 코드는 위젯이 만든 challenge 에 묶인다 (D-025)
    api.post('/api/widget/link', async (req, reply) => {
      const b = (req.body ?? {}) as { challenge?: string };
      if (!isChallenge(b.challenge)) return reply.code(400).send({ error: 'challenge 오류' });
      const d = req.device!;
      const code = linkCodes.put({ user: { id: d.userId, email: d.email }, challenge: b.challenge, name: 'Android 위젯', kind: 'widget' });
      req.log.info({ deviceId: d.id }, '위젯 연결 코드 발급');
      return { code };
    });

    // 위젯이 보여 줄 날짜 범위의 메모 앞부분과 공휴일 (D-023)
    api.get('/api/widget', async (req, reply): Promise<WidgetResponse> => {
      const { from, to } = req.query as { from?: string; to?: string };
      if (!isValidDate(from) || !isValidDate(to)) return reply.code(400).send({ error: 'from/to 오류' });
      const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
      if (days < 1 || days > WIDGET_MAX_DAYS) return reply.code(400).send({ error: `범위는 1~${WIDGET_MAX_DAYS}일` });
      const [notes, all] = await Promise.all([
        sync.rangePreview(req.device!.userId, from, to, WIDGET_PREVIEW_CHARS),
        holidays.list(),
      ]);
      return { from, to, notes, holidays: all.filter((h) => h.date >= from && h.date <= to) };
    });

    // 관리자 통계 (보기 전용, 메모 내용 없음, D-021)
    api.get('/api/admin/stats', async (req, reply) => {
      if (!isAdmin(req.device)) return reply.code(403).send({ error: '관리자만 볼 수 있습니다' });
      return adminStats(pool, cfg);
    });
  });

  // ---------- WebSocket (handshake 에서 일회용 티켓 검사) ----------
  app.get(
    '/api/ws',
    {
      websocket: true,
      preValidation: async (req, reply) => {
        const origin = req.headers.origin;
        if (origin && origin !== publicOrigin && !cfg.corsOrigins.has(origin)) {
          return reply.code(403).send({ error: 'bad origin' });
        }
        const device = wsTickets.take((req.query as { ticket?: string }).ticket);
        if (!device) return reply.code(401).send({ error: 'unauthorized' });
        req.device = device;
      },
    },
    async (socket, req) => {
      const ws = socket as WebSocket & { alive?: boolean };
      ws.alive = true;
      ws.on('pong', () => (ws.alive = true));
      ws.on('message', () => {}); // 클라이언트→서버 메시지는 쓰지 않는다
      hub.add(ws, req.device!);
      ws.send(JSON.stringify({ type: 'hello', lastSeq: await sync.lastSeq(req.device!.userId) } satisfies ServerEvent));
    },
  );
  // Funnel 등 중간 프록시의 유휴 연결 끊김 방지 + 죽은 연결 정리
  const pingTimer = setInterval(() => hub.pingAll(), 30_000);
  pingTimer.unref();
  app.addHook('onClose', async () => clearInterval(pingTimer));

  // ---------- 웹앱 정적 파일 ----------
  if (fs.existsSync(path.join(cfg.webDir, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: cfg.webDir,
      wildcard: true,
      setHeaders(res, filePath) {
        if (/[\\/]assets[\\/]/.test(filePath)) res.header('Cache-Control', 'public, max-age=31536000, immutable');
        else res.header('Cache-Control', 'no-cache');
      },
    });
    // 관리자 화면. 권한은 화면이 부르는 /api/admin/stats 에서 검사한다
    app.get('/admin', async (_req, reply) => reply.header('Cache-Control', 'no-cache').sendFile('admin.html'));
    app.setNotFoundHandler((req, reply) => {
      // 화면 경로만 index.html 로. API·정적 자원(확장자 있는 경로)이 없으면 404
      const pathOnly = req.url.split('?')[0];
      if (req.method === 'GET' && !/^\/(api|auth|assets|icons)\//.test(pathOnly) && !/\.\w+$/.test(pathOnly)) {
        return reply.type('text/html').header('Cache-Control', 'no-cache').sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not found' });
    });
  }

  return { app, sync, devices, users, hub };
}
