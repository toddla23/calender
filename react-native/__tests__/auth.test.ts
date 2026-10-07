import { ApiError, AuthExpiredError, NetworkError } from '@calendar/sync-core';
import { MemoryKv } from '../src/platform/kv';
import { getOrCreateDeviceId } from '../src/platform/ids';
import { AuthClient, TokenManager, decodeBase64Url, decodeJwtExp } from '../src/runtime/auth';

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (exp: number) => `${b64url({ alg: 'HS256' })}.${b64url({ sub: 'u1', exp })}.sig`;

const resp = (access: string, refresh = 'r1') => ({
  accessToken: access,
  refreshToken: refresh,
  expiresIn: 900,
  user: { id: 'u1', email: 'a@b.com' },
});

const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('JWT 유틸', () => {
  test('base64url 디코드(한글 포함)와 exp 추출', () => {
    expect(decodeBase64Url(Buffer.from('안녕 😀').toString('base64url'))).toBe('안녕 😀');
    expect(decodeJwtExp(jwt(1234567890))).toBe(1234567890);
    expect(decodeJwtExp('garbage')).toBeNull();
  });
});

describe('deviceId', () => {
  test('설치당 1개를 생성해 영속하고 이후에는 같은 값', async () => {
    const kv = new MemoryKv();
    let n = 0;
    const a = await getOrCreateDeviceId(kv, () => `id-${++n}`);
    const b = await getOrCreateDeviceId(kv, () => `id-${++n}`);
    expect(a).toBe('id-1');
    expect(b).toBe('id-1');
  });
});

describe('AuthClient', () => {
  test('refresh: 401은 AuthExpiredError, 5xx는 ApiError, 네트워크 실패는 NetworkError', async () => {
    const mk = (f: typeof fetch) => new AuthClient('http://x', f);
    await expect(mk(async () => jsonRes(401, { code: 'UNAUTHORIZED', message: 'no' })).refresh('r')).rejects.toBeInstanceOf(
      AuthExpiredError,
    );
    await expect(mk(async () => jsonRes(500, { code: 'E', message: 'boom' })).refresh('r')).rejects.toBeInstanceOf(ApiError);
    await expect(
      mk(async () => {
        throw new TypeError('Network request failed');
      }).refresh('r'),
    ).rejects.toBeInstanceOf(NetworkError);
  });

  test('google/dev 로그인 요청 본문', async () => {
    const fetchMock = jest.fn(async () => jsonRes(200, resp('a')));
    const c = new AuthClient('http://x', fetchMock as unknown as typeof fetch);
    await c.google('ID_TOKEN');
    await c.dev('me@x.com');
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe('http://x/api/auth/google');
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ idToken: 'ID_TOKEN' });
    expect(calls[1][0]).toBe('http://x/api/auth/dev');
    expect(JSON.parse(calls[1][1].body as string)).toEqual({ email: 'me@x.com' });
  });
});

describe('TokenManager', () => {
  test('refreshAccessToken: 갱신 후 저장하고 새 access token 반환, 동시 호출은 1번만 요청', async () => {
    const kv = new MemoryKv();
    const fetchMock = jest.fn(async () => jsonRes(200, resp('new-access', 'new-refresh')));
    const tm = new TokenManager(kv, () => new AuthClient('http://x', fetchMock as unknown as typeof fetch));
    await tm.save(resp('old-access', 'old-refresh'));

    const [a, b] = await Promise.all([tm.refreshAccessToken(), tm.refreshAccessToken()]);
    expect(a).toBe('new-access');
    expect(b).toBe('new-access');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(((fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0][1]).body as string)).toEqual({
      refreshToken: 'old-refresh',
    });
    expect(await tm.getAccessToken()).toBe('new-access');
    expect(kv.map.get('refreshToken')).toBe('new-refresh');
  });

  test('refresh 401이면 AuthExpiredError, refresh 토큰이 없어도 AuthExpiredError', async () => {
    const kv = new MemoryKv();
    const tm = new TokenManager(kv, () => new AuthClient('http://x', (async () => jsonRes(401, {})) as typeof fetch));
    await expect(tm.refreshAccessToken()).rejects.toBeInstanceOf(AuthExpiredError);
    await tm.save(resp('a', 'r'));
    await expect(tm.refreshAccessToken()).rejects.toBeInstanceOf(AuthExpiredError);
  });

  test('clear는 토큰과 사용자 정보를 모두 삭제', async () => {
    const kv = new MemoryKv();
    const tm = new TokenManager(kv, () => new AuthClient('http://x'));
    await tm.save(resp('a'));
    expect(await tm.hasSession()).toBe(true);
    await tm.clear();
    expect(await tm.hasSession()).toBe(false);
    expect(kv.map.size).toBe(0);
  });

  test('getFreshAccessToken: 만료 임박이면 갱신, 아니면 그대로', async () => {
    const now = 1_000_000_000_000;
    const kv = new MemoryKv();
    const fresh = jwt(now / 1000 + 600);
    const expiring = jwt(now / 1000 + 10);
    const fetchMock = jest.fn(async () => jsonRes(200, resp(fresh, 'r2')));
    const tm = new TokenManager(kv, () => new AuthClient('http://x', fetchMock as unknown as typeof fetch), () => now);

    await tm.save(resp(fresh));
    expect(await tm.getFreshAccessToken()).toBe(fresh);
    expect(fetchMock).not.toHaveBeenCalled();

    await tm.save(resp(expiring));
    expect(await tm.getFreshAccessToken()).toBe(fresh);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
