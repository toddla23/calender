import { describe, expect, it, vi } from 'vitest';
import { AuthExpiredError, NetworkError } from '@calendar/sync-core';
import { AuthManager, MemorySessionStorage, type Session } from './auth';

const session: Session = { accessToken: 'a1', refreshToken: 'r1', user: { id: 'u1', email: 'a@b.c' } };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function make(fetchImpl: typeof fetch, s: Session | null = session) {
  const storage = new MemorySessionStorage(s);
  const auth = new AuthManager({ baseUrl: 'http://x', storage, fetch: fetchImpl });
  return { auth, storage };
}

describe('AuthManager', () => {
  it('refresh 성공: access/refresh 모두 저장하고 새 access 반환', async () => {
    const f = vi.fn(async () => json(200, { accessToken: 'a2', refreshToken: 'r2', user: session.user }));
    const { auth, storage } = make(f as never);
    expect(await auth.refreshAccessToken()).toBe('a2');
    expect(storage.load()).toMatchObject({ accessToken: 'a2', refreshToken: 'r2' });
  });

  it('동시 refresh는 한 번만 호출 (single-flight)', async () => {
    const f = vi.fn(async () => json(200, { accessToken: 'a2', refreshToken: 'r2', user: session.user }));
    const { auth } = make(f as never);
    await Promise.all([auth.refreshAccessToken(), auth.refreshAccessToken()]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('refresh 401 → AuthExpiredError + 토큰 폐기', async () => {
    const { auth, storage } = make((async () => json(401, { code: 'X' })) as never);
    await expect(auth.refreshAccessToken()).rejects.toBeInstanceOf(AuthExpiredError);
    expect(storage.load()).toBeNull();
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('네트워크 실패/5xx는 AuthExpired가 아니라 NetworkError이고 토큰은 유지', async () => {
    const down = make((async () => {
      throw new TypeError('fetch failed');
    }) as never);
    await expect(down.auth.refreshAccessToken()).rejects.toBeInstanceOf(NetworkError);
    expect(down.auth.isLoggedIn()).toBe(true);

    const five = make((async () => json(503, {})) as never);
    await expect(five.auth.refreshAccessToken()).rejects.toBeInstanceOf(NetworkError);
    expect(five.auth.isLoggedIn()).toBe(true);
  });

  it('세션이 없으면 AuthExpiredError', async () => {
    const { auth } = make((async () => json(200, {})) as never, null);
    await expect(auth.refreshAccessToken()).rejects.toBeInstanceOf(AuthExpiredError);
  });

  it('로그인 성공 시 세션 저장, 실패 시 서버 메시지로 오류', async () => {
    const ok = make((async () => json(200, { accessToken: 'A', refreshToken: 'R', user: { id: 'u', email: 'e@x.y' } })) as never, null);
    await ok.auth.loginDev('e@x.y');
    expect(ok.storage.load()?.accessToken).toBe('A');

    const bad = make((async () => json(400, { code: 'BAD', message: '이메일 형식 오류' })) as never, null);
    await expect(bad.auth.loginWithGoogleIdToken('t')).rejects.toThrow('이메일 형식 오류');
    expect(bad.auth.isLoggedIn()).toBe(false);
  });

  it('logout은 저장소를 비운다', () => {
    const { auth, storage } = make((async () => json(200, {})) as never);
    auth.logout();
    expect(storage.load()).toBeNull();
    expect(auth.isLoggedIn()).toBe(false);
  });
});
