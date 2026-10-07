import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_SETTINGS, type Settings } from '../shared/types';

const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** 읽어 온 값을 검증/보정한다 (손상된 설정 파일 대비) */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const b = r.bounds as Record<string, unknown> | null | undefined;
  const bounds =
    b && [b.x, b.y, b.width, b.height].every((n) => typeof n === 'number' && Number.isFinite(n))
      ? { x: b.x as number, y: b.y as number, width: b.width as number, height: b.height as number }
      : null;
  return {
    opacity: clamp(r.opacity, 0.3, 1, DEFAULT_SETTINGS.opacity),
    fontSize: clamp(r.fontSize, 11, 18, DEFAULT_SETTINGS.fontSize),
    locked: r.locked === true,
    autoStart: r.autoStart === true,
    serverUrl: typeof r.serverUrl === 'string' && r.serverUrl.trim() ? r.serverUrl.trim() : null,
    bounds,
  };
}

/** userData/settings.json 영속 저장소 */
export class SettingsStore {
  private value: Settings;

  constructor(private readonly file: string) {
    this.value = DEFAULT_SETTINGS;
    try {
      if (existsSync(file)) this.value = sanitizeSettings(JSON.parse(readFileSync(file, 'utf8')));
    } catch {
      this.value = { ...DEFAULT_SETTINGS };
    }
  }

  get(): Settings {
    return this.value;
  }

  patch(p: Partial<Settings>): Settings {
    this.value = sanitizeSettings({ ...this.value, ...p });
    this.save();
    return this.value;
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.value, null, 2));
      renameSync(tmp, this.file);
    } catch (e) {
      console.warn('[설정] 저장 실패', e);
    }
  }
}
