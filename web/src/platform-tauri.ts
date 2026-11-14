// Windows 데스크톱(Tauri) 전용: 파일 저장소, DPAPI 토큰, 루프백 로그인, 바탕화면 부착 설정
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Api } from './api';
import type { KV } from './sync/engine';
import type { Platform } from './platform';
import { h, toast } from './dialogs';
import { lookVars } from './desktop-look';

const DEFAULT_SERVER = 'https://raspberry-pi.tailb6b7a3.ts.net';

export interface DesktopSettings {
  serverUrl: string;
  opacity: number; // 0 ~ 1 (배경 불투명도, 0 이면 글자만)
  bgColor: string | null; // 배경색 (null = 시스템 테마)
  textColor: string | null; // 글자색 (null = 배경에 맞춰 자동)
  fontSize: number; // 메모 글자 크기(px)
  locked: boolean;
  mode: 'desktop' | 'bottom' | 'normal';
}

const DEFAULTS: DesktopSettings = {
  serverUrl: DEFAULT_SERVER,
  opacity: 0.85,
  bgColor: null,
  textColor: null,
  fontSize: 12.5,
  locked: false,
  mode: 'desktop',
};

/** 앱 데이터 폴더의 JSON 파일 (임시 파일 + rename 으로 원자적 저장) */
class FileKV implements KV {
  async get<T>(key: string): Promise<T | undefined> {
    const s = await invoke<string | null>('store_read', { name: key });
    if (!s) return undefined;
    try {
      return JSON.parse(s) as T;
    } catch {
      return undefined;
    }
  }
  async set(key: string, value: unknown): Promise<void> {
    await invoke('store_write', { name: key, data: JSON.stringify(value) });
  }
}

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export async function createTauriPlatform(): Promise<Platform> {
  const kv = new FileKV();
  const settings: DesktopSettings = { ...DEFAULTS, ...((await kv.get<Partial<DesktopSettings>>('settings')) ?? {}) };
  let token = await invoke<string | null>('token_get');
  const api = new Api({ base: settings.serverUrl.replace(/\/+$/, ''), getToken: () => token });

  const save = () => kv.set('settings', settings);

  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  function applyLook() {
    const root = document.documentElement.style;
    for (const [k, v] of Object.entries(lookVars(settings, darkQuery.matches))) {
      if (v === null) root.removeProperty(k);
      else root.setProperty(k, v);
    }
    root.setProperty('--cell-font', `${settings.fontSize}px`);
  }
  darkQuery.addEventListener('change', applyLook);

  async function applyLock() {
    // 잠그면 드래그·크기 조절을 막는다
    for (const el of document.querySelectorAll<HTMLElement>('[data-tauri-drag-region], [data-drag-off]')) {
      if (settings.locked) {
        el.removeAttribute('data-tauri-drag-region');
        el.setAttribute('data-drag-off', '');
      } else {
        el.setAttribute('data-tauri-drag-region', '');
        el.removeAttribute('data-drag-off');
      }
    }
    await invoke('set_locked', { locked: settings.locked });
  }

  async function applyMode() {
    const applied = await invoke<string>('set_desktop_mode', { mode: settings.mode });
    if (settings.mode === 'desktop' && applied !== 'desktop') {
      toast('바탕화면에 붙이지 못해 "항상 아래" 방식으로 표시합니다.', 'warn');
    }
    return applied;
  }

  applyLook();
  await applyLock();
  await applyMode();
  await invoke('app_ready');

  // 편집할 때는 키보드 입력을 받을 수 있게 잠시 바탕화면에서 떼어 낸다
  document.addEventListener('deskcal:editing', (e) => {
    void invoke('set_editing', { editing: (e as CustomEvent<boolean>).detail });
  });
  // 대화상자(설정 등)를 여는 동안에도 입력이 필요하다
  new MutationObserver(() => {
    const open = !!document.querySelector('dialog[open]');
    void invoke('set_editing', { editing: open });
  }).observe(document.body, { childList: true, subtree: false });

  await listen('open-settings', () => document.getElementById('settings')?.click());

  return {
    kind: 'tauri',
    kv,
    api,
    async login() {
      const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
      const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      const name = `Windows 앱 (${await invoke<string>('host_name')})`;
      const code = await invoke<string>('google_login', { server: api.opts.base, challenge, name });
      const res = await fetch(`${api.opts.base}/api/auth/desktop/exchange`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, verifier }),
      });
      if (!res.ok) throw new Error(`토큰 교환 실패 (HTTP ${res.status})`);
      token = (await res.json()).token as string;
      await invoke('token_set', { token });
    },
    hasCredentials: () => !!token,
    async clearLocal() {
      token = null;
      await invoke('token_set', { token: null });
      await kv.set('cache', null);
      await kv.set('queue', []);
    },
    settingsExtras: {
      render() {
        const server = h('input', { type: 'url', value: settings.serverUrl, placeholder: DEFAULT_SERVER });
        const saveServer = h('button', { type: 'button', class: 'btn small' }, '저장');
        saveServer.addEventListener('click', async () => {
          const v = server.value.trim().replace(/\/+$/, '');
          if (!/^https:\/\/[^/]+$/.test(v) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(v)) {
            toast('https:// 로 시작하는 주소를 입력하세요.', 'error');
            return;
          }
          if (v === settings.serverUrl) return;
          if (!confirm('서버를 바꾸면 이 기기의 캐시와 로그인을 지우고 다시 시작합니다. 계속할까요?')) return;
          settings.serverUrl = v;
          await save();
          token = null;
          await invoke('token_set', { token: null });
          await kv.set('cache', null);
          await kv.set('queue', []);
          location.reload();
        });

        const opacity = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(settings.opacity) });
        const opacityLabel = h('span', { class: 'muted small' }, `${Math.round(settings.opacity * 100)}%`);
        opacity.addEventListener('input', () => {
          settings.opacity = Number(opacity.value);
          opacityLabel.textContent = `${Math.round(settings.opacity * 100)}%`;
          applyLook();
        });

        // 색 선택: input[type=color] + "기본" 버튼 (null = 자동)
        const colorField = (key: 'bgColor' | 'textColor', fallback: string, resetLabel: string) => {
          const input = h('input', { type: 'color', value: settings[key] ?? fallback });
          const state = h('span', { class: 'muted small' }, settings[key] ? '' : resetLabel);
          const reset = h('button', { type: 'button', class: 'btn small' }, '기본');
          input.addEventListener('input', () => {
            settings[key] = input.value;
            state.textContent = '';
            applyLook();
          });
          input.addEventListener('change', () => void save());
          reset.addEventListener('click', () => {
            settings[key] = null;
            state.textContent = resetLabel;
            applyLook();
            void save();
          });
          return [input, reset, state];
        };
        const dark = darkQuery.matches;
        opacity.addEventListener('change', () => void save());

        const font = h('input', { type: 'range', min: '10', max: '18', step: '0.5', value: String(settings.fontSize) });
        font.addEventListener('input', () => {
          settings.fontSize = Number(font.value);
          applyLook();
        });
        font.addEventListener('change', () => void save());

        const lock = h('input', { type: 'checkbox', checked: settings.locked });
        lock.addEventListener('change', async () => {
          settings.locked = lock.checked;
          await applyLock();
          await save();
        });

        const mode = h(
          'select',
          {},
          h('option', { value: 'desktop' }, '바탕화면에 붙이기 (Win+D 에도 보임)'),
          h('option', { value: 'bottom' }, '항상 다른 창 아래'),
          h('option', { value: 'normal' }, '일반 창'),
        );
        mode.value = settings.mode;
        mode.addEventListener('change', async () => {
          settings.mode = mode.value as DesktopSettings['mode'];
          await save();
          await applyMode();
          // 설정 창이 열려 있으므로 편집 상태 유지
          void invoke('set_editing', { editing: true });
        });

        const auto = h('input', { type: 'checkbox' });
        invoke<boolean>('autostart_get').then((v) => (auto.checked = v));
        auto.addEventListener('change', async () => {
          try {
            await invoke('autostart_set', { enabled: auto.checked });
          } catch (e) {
            toast(`자동 실행 설정 실패: ${e}`, 'error');
            auto.checked = !auto.checked;
          }
        });

        const field = (label: string, ...els: Node[]) => h('label', { class: 'field' }, h('span', {}, label), ...els);
        return [
          h(
            'section',
            {},
            h('h3', {}, '윈도우 앱'),
            field('서버 주소', server, saveServer),
            field('배경색', ...colorField('bgColor', dark ? '#1f1f24' : '#ffffff', '시스템 테마')),
            field('글자색', ...colorField('textColor', dark ? '#e8e8ee' : '#1d1d22', '자동')),
            field('배경 불투명도', opacity, opacityLabel),
            field('글자 크기', font),
            field('표시 방식', mode),
            field('위치·크기 잠금', lock),
            field('윈도우 시작 시 자동 실행', auto),
            h('p', { class: 'muted small' }, '창은 위쪽 막대를 끌어 옮기고 가장자리를 끌어 크기를 바꿉니다. 트레이 아이콘으로 보이기/숨기기를 할 수 있습니다.'),
          ),
        ];
      },
    },
  };
}
