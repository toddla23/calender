/** 서버 주소 정규화/변환 */

export class InvalidServerUrlError extends Error {
  constructor(input: string) {
    super(`서버 주소가 올바르지 않습니다: ${input}`);
    this.name = 'InvalidServerUrlError';
  }
}

/**
 * 사용자가 입력한 주소를 'http(s)://host[:port][/path]' 형태(끝 슬래시 없음)로 정규화한다.
 * 스킴이 없으면 http:// 를 붙인다.
 */
export function normalizeBaseUrl(input: string): string {
  let s = input.trim();
  if (!s) throw new InvalidServerUrlError(input);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `http://${s}`;
  const m = /^(https?):\/\/([^/?#\s]+)((?:\/[^?#\s]*)?)$/i.exec(s);
  if (!m) throw new InvalidServerUrlError(input);
  const path = m[3].replace(/\/+$/, '');
  return `${m[1].toLowerCase()}://${m[2].toLowerCase()}${path}`;
}

/** http → ws, https → wss, 경로 끝에 /ws */
export function toWsUrl(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  return base.replace(/^http/i, 'ws') + '/ws';
}
