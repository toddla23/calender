import { describe, expect, it } from 'vitest';
import { normalizeServerUrl, toWsUrl } from './url';

describe('normalizeServerUrl', () => {
  it('끝 슬래시/공백 제거', () => {
    expect(normalizeServerUrl(' http://localhost:8080/ ')).toBe('http://localhost:8080');
    expect(normalizeServerUrl('https://cal.example.com///')).toBe('https://cal.example.com');
  });
  it('스킴이 없으면 http 추가', () => {
    expect(normalizeServerUrl('192.168.0.10:8080')).toBe('http://192.168.0.10:8080');
  });
  it('쿼리/해시 제거, 경로 접두사 유지', () => {
    expect(normalizeServerUrl('https://example.com/cal/?a=1#x')).toBe('https://example.com/cal');
  });
  it('잘못된 값은 오류', () => {
    expect(() => normalizeServerUrl('')).toThrow();
    expect(() => normalizeServerUrl('ftp://x.com')).toThrow();
    expect(() => normalizeServerUrl('http://')).toThrow();
  });
});

describe('toWsUrl', () => {
  it('http→ws, https→wss, /ws 추가', () => {
    expect(toWsUrl('http://localhost:8080')).toBe('ws://localhost:8080/ws');
    expect(toWsUrl('https://cal.example.com')).toBe('wss://cal.example.com/ws');
    expect(toWsUrl('https://cal.example.com/')).toBe('wss://cal.example.com/ws');
    expect(toWsUrl('https://example.com/cal')).toBe('wss://example.com/cal/ws');
  });
});
