export const DEFAULT_SERVER_URL = 'http://localhost:8080';

/** 사용자가 입력한 서버 주소를 정규화한다. http/https만 허용, 끝 슬래시/쿼리/해시 제거 */
export function normalizeServerUrl(raw: string): string {
  let s = raw.trim();
  if (!s) throw new Error('서버 주소가 비어 있습니다');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `http://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error(`서버 주소 형식이 올바르지 않습니다: ${raw}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('서버 주소는 http 또는 https만 사용할 수 있습니다');
  }
  const path = u.pathname.replace(/\/+$/, '');
  return `${u.protocol}//${u.host}${path}`;
}

/** http→ws, https→wss 로 바꾸고 /ws 경로를 붙인다 */
export function toWsUrl(baseUrl: string): string {
  const base = normalizeServerUrl(baseUrl);
  return base.replace(/^http/i, 'ws') + '/ws';
}
