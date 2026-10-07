import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Session } from './auth';
import { SafeSessionStorage, type SecretBox } from './session-storage';
import { SettingsStore, sanitizeSettings } from './settings-store';

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'cal-test-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

/** 가짜 safeStorage: 뒤집어서 "암호화" (평문이 파일에 없음을 검증하기 위함) */
const box = (available = true): SecretBox => ({
  isAvailable: () => available,
  encrypt: (s) => Buffer.from([...Buffer.from(s)].reverse()),
  decrypt: (b) => Buffer.from([...b].reverse()).toString(),
});
const session: Session = { accessToken: 'ACCESS-SECRET', refreshToken: 'REFRESH-SECRET', user: { id: 'u', email: 'e@x.y' } };

describe('SafeSessionStorage', () => {
  it('암호화해 저장하고 평문은 파일에 남지 않으며, 다시 읽을 수 있다', () => {
    const f = join(tmp(), 'auth.bin');
    const s = new SafeSessionStorage(f, box());
    s.save(session);
    expect(readFileSync(f).toString()).not.toContain('ACCESS-SECRET');
    expect(new SafeSessionStorage(f, box()).load()).toEqual(session);
  });
  it('삭제(null) 시 파일 제거', () => {
    const f = join(tmp(), 'auth.bin');
    const s = new SafeSessionStorage(f, box());
    s.save(session);
    s.save(null);
    expect(existsSync(f)).toBe(false);
    expect(s.load()).toBeNull();
  });
  it('암호화 불가면 디스크에 쓰지 않는다', () => {
    const f = join(tmp(), 'auth.bin');
    const warns: string[] = [];
    new SafeSessionStorage(f, box(false), (m) => warns.push(m)).save(session);
    expect(existsSync(f)).toBe(false);
    expect(warns.length).toBe(1);
  });
  it('손상된 파일은 null', () => {
    const f = join(tmp(), 'auth.bin');
    writeFileSync(f, 'garbage');
    expect(new SafeSessionStorage(f, box(), () => {}).load()).toBeNull();
  });
});

describe('SettingsStore', () => {
  it('기본값, 영속, 범위 보정', () => {
    const f = join(tmp(), 'settings.json');
    const a = new SettingsStore(f);
    expect(a.get().opacity).toBeGreaterThan(0.3);
    a.patch({ opacity: 5, fontSize: 1, locked: true, bounds: { x: 1, y: 2, width: 300, height: 400 } });
    const b = new SettingsStore(f);
    expect(b.get()).toMatchObject({ opacity: 1, fontSize: 11, locked: true, bounds: { x: 1, y: 2, width: 300, height: 400 } });
  });
  it('손상된 JSON은 기본값', () => {
    const f = join(tmp(), 'settings.json');
    writeFileSync(f, '{broken');
    expect(new SettingsStore(f).get().locked).toBe(false);
  });
  it('sanitize: 잘못된 타입 무시', () => {
    expect(sanitizeSettings({ opacity: 'x', bounds: { x: 'a' }, serverUrl: '  ' })).toMatchObject({
      bounds: null,
      serverUrl: null,
    });
  });
});
