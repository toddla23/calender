import { BrowserWindow, screen } from 'electron';
import type { Settings, WidgetBounds } from '../shared/types';
import type { SettingsStore } from './settings-store';
import type { ZOrderController } from './win-zorder';

const DEFAULT_SIZE = { width: 380, height: 600 };
const MIN_SIZE = { width: 300, height: 420 };

/** 저장된 위치가 현재 연결된 모니터 안에 있는지 확인 (모니터 분리/해상도 변경 대비) */
function visibleBounds(b: WidgetBounds | null): WidgetBounds | null {
  if (!b) return null;
  const ok = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x + 60 < a.x + a.width && b.x + b.width - 60 > a.x && b.y < a.y + a.height - 30 && b.y + 30 > a.y;
  });
  return ok ? b : null;
}

function defaultBounds(): WidgetBounds {
  const a = screen.getPrimaryDisplay().workArea;
  return { x: a.x + a.width - DEFAULT_SIZE.width - 24, y: a.y + 24, ...DEFAULT_SIZE };
}

export function applyWindowSettings(win: BrowserWindow, s: Settings): void {
  win.setOpacity(s.opacity);
  win.setResizable(!s.locked);
  win.setMovable(!s.locked);
}

export interface CreateWindowOptions {
  settings: SettingsStore;
  zorder: ZOrderController;
  preload: string;
  /** dev 서버 URL 또는 null이면 loadFile */
  rendererUrl: string | null;
  rendererFile: string;
  log: { info(...a: unknown[]): void; warn(...a: unknown[]): void };
}

export function createMainWindow(o: CreateWindowOptions): BrowserWindow {
  const s = o.settings.get();
  const bounds = visibleBounds(s.bounds) ?? defaultBounds();

  const win = new BrowserWindow({
    ...bounds,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    frame: false,
    show: false,
    skipTaskbar: true,
    // alwaysOnTop은 사용하지 않는다: blur 시 SetWindowPos(HWND_BOTTOM)로 맨 아래 유지
    alwaysOnTop: false,
    resizable: !s.locked,
    movable: !s.locked,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#1f2330',
    title: '캘린더',
    webPreferences: {
      preload: o.preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const lower = () => {
    if (!win.isDestroyed()) o.zorder.lowerToBottom(win.getNativeWindowHandle());
  };

  win.once('ready-to-show', () => {
    applyWindowSettings(win, o.settings.get());
    win.show();
  });
  // 포커스를 잃을 때마다 맨 아래로. (입력 중에는 정상적으로 앞에 보인다)
  win.on('blur', lower);

  let timer: ReturnType<typeof setTimeout> | null = null;
  const saveBounds = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (win.isDestroyed() || win.isMinimized()) return;
      o.settings.patch({ bounds: win.getBounds() });
    }, 400);
  };
  win.on('moved', saveBounds);
  win.on('resized', saveBounds);

  // 외부 링크/창 생성 차단
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  // 닫기 버튼은 종료가 아니라 트레이로 숨김 (종료는 트레이 메뉴)
  win.on('close', (e) => {
    if (!(win as BrowserWindow & { forceClose?: boolean }).forceClose) {
      e.preventDefault();
      win.hide();
    }
  });

  if (o.rendererUrl) void win.loadURL(o.rendererUrl);
  else void win.loadFile(o.rendererFile);
  return win;
}
