import { Api } from './api';
import type { KV } from './sync/engine';
import { IdbKV } from './sync/kv-idb';
import type { SettingsExtras } from './dialogs';

export interface Platform {
  kind: 'web' | 'tauri';
  kv: KV;
  api: Api;
  /** 로그인 시작 (웹: Google 로 이동, Tauri: 시스템 브라우저 + 루프백) */
  login(): Promise<void>;
  /** 로컬 토큰/데이터 정리 */
  clearLocal(): Promise<void>;
  /** 저장된 로그인 정보가 확실히 없으면 false (웹은 HttpOnly 쿠키라 알 수 없음 → undefined) */
  hasCredentials?(): boolean;
  settingsExtras?: SettingsExtras;
}

export const isTauri = () => '__TAURI_INTERNALS__' in window;

export async function getPlatform(): Promise<Platform> {
  if (isTauri()) {
    const m = await import('./platform-tauri');
    return m.createTauriPlatform();
  }
  return createWebPlatform();
}

function createWebPlatform(): Platform {
  const kv = new IdbKV();
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  return {
    kind: 'web',
    kv,
    api: new Api({ base: '' }),
    async login() {
      location.href = '/auth/google/start';
    },
    async clearLocal() {
      await kv.set('cache', null);
      await kv.set('queue', []);
    },
  };
}
