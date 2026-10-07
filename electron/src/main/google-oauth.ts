import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export interface GoogleOAuthConfig {
  clientId: string;
  /** 데스크톱 앱 클라이언트도 토큰 교환 시 시크릿을 요구하는 경우가 있다 */
  clientSecret?: string;
  /**
   * 루프백 포트 고정. 비우면 임의 포트(데스크톱 앱 유형 클라이언트용).
   * '웹 애플리케이션' 유형 클라이언트는 포트까지 일치하는 URI만 허용하므로,
   * 콘솔에 http://127.0.0.1:{포트}/callback 을 등록하고 같은 포트를 지정한다.
   */
  loopbackPort?: number;
}

export interface GoogleLoginOptions extends GoogleOAuthConfig {
  /** 시스템 브라우저로 URL 열기 (Electron: shell.openExternal) */
  openExternal: (url: string) => Promise<void> | void;
  timeoutMs?: number;
  fetch?: typeof fetch;
  authEndpoint?: string;
  tokenEndpoint?: string;
  /** 취소 신호 */
  signal?: AbortSignal;
}

export function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function buildAuthUrl(p: {
  endpoint: string;
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    state: p.state,
    prompt: 'select_account',
  });
  return `${p.endpoint}?${q}`;
}

const page = (title: string, body: string) =>
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title>` +
  `<style>body{font-family:'Malgun Gothic',sans-serif;text-align:center;margin-top:20vh;color:#333}</style></head>` +
  `<body><h2>${title}</h2><p>${body}</p></body></html>`;

/**
 * 시스템 브라우저 + 루프백(127.0.0.1:임의포트) + PKCE 로 Google 로그인을 수행하고 id_token을 반환한다.
 * 이 함수가 반환한 id_token을 백엔드 POST /api/auth/google 에 전달한다.
 */
export async function loginWithGoogle(o: GoogleLoginOptions): Promise<string> {
  const fetchImpl = o.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const { verifier, challenge } = createPkce();
  const state = base64Url(randomBytes(16));

  let server: Server | undefined;
  try {
    const codePromise = new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
      const srv = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        if (url.pathname !== '/callback') {
          res.writeHead(404).end();
          return;
        }
        const port = (srv.address() as AddressInfo).port;
        const redirectUri = `http://127.0.0.1:${port}/callback`;
        const err = url.searchParams.get('error');
        const code = url.searchParams.get('code');
        const gotState = url.searchParams.get('state');
        const send = (status: number, title: string, msg: string) =>
          res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }).end(page(title, msg));

        if (err) {
          send(400, '로그인 취소', '로그인이 취소되었거나 거부되었습니다. 이 창을 닫아도 됩니다.');
          reject(new Error(`Google 로그인 실패: ${err}`));
        } else if (!code || gotState !== state) {
          send(400, '잘못된 요청', '상태 값이 일치하지 않습니다.');
          reject(new Error('Google 로그인 응답의 state가 일치하지 않습니다'));
        } else {
          send(200, '로그인 완료', '캘린더 앱으로 돌아가세요. 이 창은 닫아도 됩니다.');
          resolve({ code, redirectUri });
        }
      });
      server = srv;
      srv.on('error', reject);
      srv.listen(o.loopbackPort ?? 0, '127.0.0.1', async () => {
        const port = (srv.address() as AddressInfo).port;
        const redirectUri = `http://127.0.0.1:${port}/callback`;
        try {
          await o.openExternal(
            buildAuthUrl({
              endpoint: o.authEndpoint ?? GOOGLE_AUTH_ENDPOINT,
              clientId: o.clientId,
              redirectUri,
              challenge,
              state,
            }),
          );
        } catch (e) {
          reject(e);
        }
      });
    });

    const timeout = new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(new Error('로그인 시간이 초과되었습니다')), o.timeoutMs ?? 180_000);
      t.unref?.();
    });
    const aborted = new Promise<never>((_, reject) => {
      o.signal?.addEventListener('abort', () => reject(new Error('로그인이 취소되었습니다')));
    });

    const { code, redirectUri } = await Promise.race([codePromise, timeout, aborted]);

    const body = new URLSearchParams({
      code,
      client_id: o.clientId,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    if (o.clientSecret) body.set('client_secret', o.clientSecret);

    const res = await fetchImpl(o.tokenEndpoint ?? GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json.id_token) {
      throw new Error(`Google 토큰 교환 실패: ${json.error_description ?? json.error ?? res.status}`);
    }
    return json.id_token as string;
  } finally {
    server?.close();
    server?.closeAllConnections?.();
  }
}
