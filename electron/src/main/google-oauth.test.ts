import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { base64Url, buildAuthUrl, createPkce, loginWithGoogle } from './google-oauth';

describe('PKCE', () => {
  it('challenge = base64url(sha256(verifier))', () => {
    const { verifier, challenge } = createPkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(base64Url(createHash('sha256').update(verifier).digest()));
    expect(challenge).not.toMatch(/[+/=]/);
  });
  it('인증 URL 구성', () => {
    const u = new URL(
      buildAuthUrl({ endpoint: 'https://x/auth', clientId: 'cid', redirectUri: 'http://127.0.0.1:1/callback', challenge: 'ch', state: 'st' }),
    );
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:1/callback');
    expect(u.searchParams.get('scope')).toContain('openid');
  });
});

/** 가짜 브라우저: 열린 인증 URL을 읽어 루프백 콜백을 호출한다 */
function fakeBrowser(mode: 'ok' | 'bad-state' | 'denied') {
  let authUrl: URL | null = null;
  return {
    get url() {
      return authUrl!;
    },
    open: async (url: string) => {
      authUrl = new URL(url);
      const redirect = new URL(authUrl.searchParams.get('redirect_uri')!);
      if (mode === 'ok') {
        redirect.searchParams.set('code', 'the-code');
        redirect.searchParams.set('state', authUrl.searchParams.get('state')!);
      } else if (mode === 'bad-state') {
        redirect.searchParams.set('code', 'the-code');
        redirect.searchParams.set('state', 'forged');
      } else {
        redirect.searchParams.set('error', 'access_denied');
      }
      setTimeout(() => void fetch(redirect).catch(() => {}), 10);
    },
  };
}

describe('loginWithGoogle (루프백 + PKCE, 가짜 Google)', () => {
  it('코드 수신 후 토큰 엔드포인트로 교환해 id_token 반환', async () => {
    const browser = fakeBrowser('ok');
    let tokenBody: URLSearchParams | null = null;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      tokenBody = new URLSearchParams(init.body as URLSearchParams);
      return new Response(JSON.stringify({ id_token: 'ID.TOKEN' }), { status: 200 });
    }) as unknown as typeof fetch;

    const idToken = await loginWithGoogle({
      clientId: 'cid',
      clientSecret: 'sec',
      openExternal: browser.open,
      fetch: fakeFetch,
    });
    expect(idToken).toBe('ID.TOKEN');
    expect(browser.url.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    expect(tokenBody!.get('code')).toBe('the-code');
    expect(tokenBody!.get('client_secret')).toBe('sec');
    expect(tokenBody!.get('redirect_uri')).toBe(browser.url.searchParams.get('redirect_uri'));
    // 보낸 code_verifier가 URL의 code_challenge와 일치
    const challenge = base64Url(createHash('sha256').update(tokenBody!.get('code_verifier')!).digest());
    expect(challenge).toBe(browser.url.searchParams.get('code_challenge'));
  });

  it('state 불일치는 거부', async () => {
    const browser = fakeBrowser('bad-state');
    await expect(
      loginWithGoogle({ clientId: 'cid', openExternal: browser.open, fetch: (async () => new Response('{}')) as never }),
    ).rejects.toThrow(/state/);
  });

  it('사용자가 거부하면 오류', async () => {
    const browser = fakeBrowser('denied');
    await expect(
      loginWithGoogle({ clientId: 'cid', openExternal: browser.open, fetch: (async () => new Response('{}')) as never }),
    ).rejects.toThrow(/access_denied/);
  });

  it('토큰 교환 실패 시 오류', async () => {
    const browser = fakeBrowser('ok');
    const f = (async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })) as unknown as typeof fetch;
    await expect(loginWithGoogle({ clientId: 'cid', openExternal: browser.open, fetch: f })).rejects.toThrow(/invalid_grant/);
  });

  it('타임아웃/취소', async () => {
    await expect(loginWithGoogle({ clientId: 'c', openExternal: () => {}, timeoutMs: 50 })).rejects.toThrow(/시간이 초과/);
    const ac = new AbortController();
    const p = loginWithGoogle({ clientId: 'c', openExternal: () => {}, signal: ac.signal });
    setTimeout(() => ac.abort(), 30);
    await expect(p).rejects.toThrow(/취소/);
  });
});
