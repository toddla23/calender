import { InvalidServerUrlError, normalizeBaseUrl, toWsUrl } from '../src/lib/url';

describe('서버 URL', () => {
  test('정규화', () => {
    expect(normalizeBaseUrl('http://10.0.2.2:8080/')).toBe('http://10.0.2.2:8080');
    expect(normalizeBaseUrl('  HTTPS://Cal.Example.com//  ')).toBe('https://cal.example.com');
    expect(normalizeBaseUrl('192.168.0.5:8080')).toBe('http://192.168.0.5:8080');
    expect(normalizeBaseUrl('https://example.com/api/')).toBe('https://example.com/api');
  });

  test('잘못된 주소', () => {
    expect(() => normalizeBaseUrl('')).toThrow(InvalidServerUrlError);
    expect(() => normalizeBaseUrl('ftp://x.com')).toThrow(InvalidServerUrlError);
    expect(() => normalizeBaseUrl('http://')).toThrow(InvalidServerUrlError);
    expect(() => normalizeBaseUrl('http://a b.com')).toThrow(InvalidServerUrlError);
  });

  test('http→ws, https→wss, /ws 추가', () => {
    expect(toWsUrl('http://10.0.2.2:8080')).toBe('ws://10.0.2.2:8080/ws');
    expect(toWsUrl('https://cal.example.com/')).toBe('wss://cal.example.com/ws');
    expect(toWsUrl('https://example.com/app')).toBe('wss://example.com/app/ws');
  });
});
