import crypto from 'node:crypto';
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Config } from './config.js';

export const SESSION_COOKIE = 'dc_session';
export const OAUTH_COOKIE = 'dc_oauth';

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/**
 * 실제 클라이언트 IP.
 * Funnel 을 거치면 모든 요청이 127.0.0.1 에서 오므로, 소켓 주소가 루프백일 때만 X-Forwarded-For 를 믿는다.
 * 클라이언트가 직접 넣은 값은 앞쪽에 붙으므로, 프록시가 붙인 맨 오른쪽 값을 쓴다.
 */
export function clientIp(req: FastifyRequest): string {
  const sock = req.socket.remoteAddress ?? '';
  const isLoopback = sock === '127.0.0.1' || sock === '::1' || sock === '::ffff:127.0.0.1';
  const xff = req.headers['x-forwarded-for'];
  if (isLoopback && xff) {
    const parts = (Array.isArray(xff) ? xff.join(',') : xff).split(',').map((s) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last.length <= 45) return last;
  }
  return sock;
}

/** IP 별 로그인 실패 횟수 제한: 5회 실패 시 15분 잠금 */
export class LoginLimiter {
  private map = new Map<string, { fails: number; lockedUntil: number; first: number }>();
  constructor(
    private maxFails = 5,
    private lockMs = 15 * 60_000,
  ) {}
  isLocked(ip: string, now = Date.now()): boolean {
    const e = this.map.get(ip);
    if (!e) return false;
    if (e.lockedUntil > now) return true;
    if (e.lockedUntil && e.lockedUntil <= now) this.map.delete(ip);
    return false;
  }
  fail(ip: string, now = Date.now()) {
    const e = this.map.get(ip) ?? { fails: 0, lockedUntil: 0, first: now };
    if (now - e.first > this.lockMs) Object.assign(e, { fails: 0, first: now });
    e.fails++;
    if (e.fails >= this.maxFails) e.lockedUntil = now + this.lockMs;
    this.map.set(ip, e);
    if (this.map.size > 10_000) this.prune(now);
  }
  success(ip: string) {
    this.map.delete(ip);
  }
  private prune(now: number) {
    for (const [k, v] of this.map) if (v.lockedUntil < now && now - v.first > this.lockMs) this.map.delete(k);
  }
}

/** 사용자별 op 속도 제한 (토큰 버킷). 1분에 perMinute 개, 한꺼번에는 perMinute 개까지 */
export class OpLimiter {
  private map = new Map<number, { tokens: number; at: number }>();
  constructor(private perMinute: number) {}
  take(userId: number, n: number, now = Date.now()): boolean {
    const e = this.map.get(userId) ?? { tokens: this.perMinute, at: now };
    e.tokens = Math.min(this.perMinute, e.tokens + ((now - e.at) / 60_000) * this.perMinute);
    e.at = now;
    this.map.set(userId, e);
    if (this.map.size > 10_000) for (const [k, v] of this.map) if (now - v.at > 60_000) this.map.delete(k);
    if (e.tokens < n) return false;
    e.tokens -= n;
    return true;
  }
}

export interface Device {
  id: number;
  userId: number;
  email: string;
  name: string;
  /** widget: Android 홈 화면 위젯 (D-025) */
  kind: 'web' | 'desktop' | 'widget';
}

/** 기기 토큰 발급/검증/폐기 */
export class DeviceStore {
  private touchCache = new Map<number, number>();
  constructor(
    private pool: Pool,
    private idleDays: number,
  ) {}

  async create(
    user: { id: number; email: string },
    name: string,
    kind: Device['kind'],
    ip: string,
  ): Promise<{ token: string; device: Device }> {
    const token = randomToken(32);
    const now = new Date();
    const [r] = await this.pool.query<ResultSetHeader>(
      'INSERT INTO devices (user_id, email, name, kind, token_hash, created_at, last_used_at, last_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [user.id, user.email, name.slice(0, 100), kind, sha256(token), now, now, ip],
    );
    return { token, device: { id: r.insertId, userId: user.id, email: user.email, name, kind } };
  }

  /** 토큰 검증. 폐기됐거나 90일 동안 안 쓴 토큰, 사용자가 없는 토큰은 거부한다. */
  async verify(token: string, ip: string): Promise<Device | null> {
    if (!token || token.length > 200) return null;
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT d.id, d.user_id, u.email, d.name, d.kind FROM devices d JOIN users u ON u.id = d.user_id
       WHERE d.token_hash = ? AND d.revoked_at IS NULL AND d.last_used_at > NOW(3) - INTERVAL ? DAY`,
      [sha256(token), this.idleDays],
    );
    if (!rows.length) return null;
    const r = rows[0];
    // last_used_at 은 10분에 한 번만 갱신해 쓰기를 줄인다
    const now = Date.now();
    if ((this.touchCache.get(r.id) ?? 0) < now - 10 * 60_000) {
      this.touchCache.set(r.id, now);
      await this.pool.query('UPDATE devices SET last_used_at = NOW(3), last_ip = ? WHERE id = ?', [ip, r.id]);
    }
    return { id: r.id, userId: r.user_id, email: r.email, name: r.name, kind: r.kind };
  }

  /** 그 사용자의 기기만 */
  async list(userId: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, email, name, kind, created_at, last_used_at, last_ip FROM devices
       WHERE user_id = ? AND revoked_at IS NULL AND last_used_at > NOW(3) - INTERVAL ? DAY ORDER BY last_used_at DESC`,
      [userId, this.idleDays],
    );
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      kind: r.kind,
      createdAt: (r.created_at as Date).toISOString(),
      lastUsedAt: (r.last_used_at as Date).toISOString(),
      lastIp: r.last_ip,
    }));
  }

  /** 자기 기기만 폐기할 수 있다 */
  async revoke(id: number, userId: number): Promise<boolean> {
    const [r] = await this.pool.query<ResultSetHeader>(
      'UPDATE devices SET revoked_at = NOW(3) WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
      [id, userId],
    );
    this.touchCache.delete(id);
    return r.affectedRows > 0;
  }
}

/** 수명이 짧은 일회용 값 저장소 (OAuth state, 데스크톱 교환 코드, WS 티켓) */
export class EphemeralStore<T> {
  private map = new Map<string, { v: T; exp: number }>();
  constructor(private ttlMs: number) {}
  put(v: T): string {
    const key = randomToken(32);
    this.map.set(key, { v, exp: Date.now() + this.ttlMs });
    if (this.map.size > 1000) this.prune();
    return key;
  }
  take(key: unknown): T | null {
    if (typeof key !== 'string') return null;
    const e = this.map.get(key);
    if (!e) return null;
    this.map.delete(key);
    return e.exp > Date.now() ? e.v : null;
  }
  private prune() {
    const now = Date.now();
    for (const [k, e] of this.map) if (e.exp <= now) this.map.delete(k);
  }
}

export const pkceChallenge = (verifier: string) => crypto.createHash('sha256').update(verifier).digest('base64url');

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Google OAuth (authorization code + PKCE). 테스트에서는 이 인터페이스를 가짜로 바꿔 끼운다. */
export interface GoogleAuth {
  authUrl(state: string, codeChallenge: string): string;
  /** code 를 교환하고 검증된 이메일을 돌려준다. 실패하면 예외. */
  exchange(code: string, codeVerifier: string): Promise<{ email: string; emailVerified: boolean }>;
}

export function createGoogleAuth(cfg: Config): GoogleAuth {
  const redirectUri = `${cfg.publicUrl}/auth/google/callback`;
  const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  return {
    authUrl(state, codeChallenge) {
      const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      u.search = new URLSearchParams({
        client_id: cfg.google.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString();
      return u.toString();
    },
    async exchange(code, codeVerifier) {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: cfg.google.clientId,
          client_secret: cfg.google.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Google 토큰 교환 실패 (HTTP ${res.status})`);
      const body = (await res.json()) as { id_token?: string };
      if (!body.id_token) throw new Error('id_token 없음');
      const { payload } = await jwtVerify(body.id_token, jwks, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: cfg.google.clientId,
      });
      return {
        email: String(payload.email ?? '').toLowerCase(),
        emailVerified: payload.email_verified === true,
      };
    },
  };
}

/** User-Agent 로 기기 이름을 대략 만든다 */
export function deviceNameFromUA(ua: string | undefined): string {
  const s = ua ?? '';
  const os = /Android/.test(s)
    ? 'Android'
    : /iPhone|iPad/.test(s)
      ? 'iOS'
      : /Windows/.test(s)
        ? 'Windows'
        : /Mac OS/.test(s)
          ? 'macOS'
          : /Linux/.test(s)
            ? 'Linux'
            : '기기';
  const br = /Edg\//.test(s) ? 'Edge' : /SamsungBrowser/.test(s) ? 'Samsung' : /Chrome\//.test(s) ? 'Chrome' : /Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : '브라우저';
  return `${os} ${br}`;
}
