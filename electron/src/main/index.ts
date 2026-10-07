import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, nativeImage, safeStorage, shell, Tray } from 'electron';
import { CH } from '../shared/ipc';
import { AppCore } from './app-core';
import { SettingsStore } from './settings-store';
import { createZOrderController } from './win-zorder';
import { applyWindowSettings, createMainWindow } from './window';

const log = {
  info: (...a: unknown[]) => console.log(...a),
  warn: (...a: unknown[]) => console.warn(...a),
};

// 이전 실행의 사용자 데이터 경로를 고정 (패키지/개발 모드 모두 동일한 폴더명)
app.setName('CalendarWidget');
// 테스트/다중 프로필용: 사용자 데이터 폴더를 환경변수로 바꿀 수 있다
if (process.env.CALENDAR_USER_DATA) app.setPath('userData', process.env.CALENDAR_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void main();
}

async function main(): Promise<void> {
  let win: BrowserWindow | null = null;
  let tray: Tray | null = null;
  let quitting = false;

  const showWindow = () => {
    if (!win) return;
    win.show();
    win.focus();
  };
  app.on('second-instance', showWindow);

  await app.whenReady();

  const userData = app.getPath('userData');
  const settings = new SettingsStore(join(userData, 'settings.json'));
  const zorder = createZOrderController(log);

  const send = (channel: string, payload?: unknown) => {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  const applyAutoStart = (enabled: boolean) => {
    if (!app.isPackaged) {
      log.info(`[자동 시작] 개발 모드에서는 로그인 항목을 변경하지 않습니다 (요청값: ${enabled})`);
      return;
    }
    app.setLoginItemSettings({ openAtLogin: enabled });
  };

  const core = new AppCore({
    userDataDir: userData,
    settings,
    secretBox: {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (s) => safeStorage.encryptString(s),
      decrypt: (b) => safeStorage.decryptString(b),
    },
    openExternal: (url) => shell.openExternal(url),
    emit: send,
    applySettings: (s, prev) => {
      if (win) applyWindowSettings(win, s);
      if (s.autoStart !== prev.autoStart) applyAutoStart(s.autoStart);
    },
    relaunch: () => {
      quitting = true;
      app.relaunch();
      app.exit(0);
    },
    log,
  });
  await core.start();

  registerIpc(core, () => win);

  win = createMainWindow({
    settings,
    zorder,
    preload: join(__dirname, '../preload/index.js'),
    rendererUrl: process.env['ELECTRON_RENDERER_URL'] ?? null,
    rendererFile: join(__dirname, '../renderer/index.html'),
    log,
  });

  // 트레이
  const iconPath = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'resources/icon.png');
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip('캘린더');
  const rebuildMenu = () =>
    tray!.setContextMenu(
      Menu.buildFromTemplate([
        { label: win?.isVisible() ? '숨기기' : '보이기', click: () => (win?.isVisible() ? win.hide() : showWindow()) },
        { type: 'separator' },
        { label: '종료', click: () => app.quit() },
      ]),
    );
  rebuildMenu();
  tray.on('click', () => {
    if (win?.isVisible()) win.hide();
    else showWindow();
  });
  tray.on('right-click', rebuildMenu);

  app.on('before-quit', () => {
    quitting = true;
    if (win) (win as BrowserWindow & { forceClose?: boolean }).forceClose = true;
  });
  app.on('will-quit', () => {
    void core.shutdown();
  });
  // 창이 모두 숨겨져도 종료하지 않는다 (트레이 상주)
  app.on('window-all-closed', () => {
    if (quitting) app.quit();
  });

  if (process.env.CALENDAR_SELFTEST === '1') void zOrderSelfTest(win, zorder);
}

function registerIpc(core: AppCore, getWin: () => BrowserWindow | null): void {
  const h = ipcMain.handle.bind(ipcMain);
  h(CH.getSnapshot, () => core.getSnapshot());
  h(CH.listNotes, (_e, from: string, to: string, includeDeleted: boolean) => core.listNotes(from, to, !!includeDeleted));
  h(CH.searchNotes, (_e, q: string) => core.searchNotes(String(q ?? '')));
  h(CH.createNote, (_e, d) => core.createNote(d));
  h(CH.updateNote, (_e, id: string, patch) => core.updateNote(id, patch));
  h(CH.deleteNote, (_e, id: string) => core.deleteNote(id));
  h(CH.restoreNote, (_e, id: string) => core.restoreNote(id));
  h(CH.getHolidays, (_e, year: number) => core.getHolidays(Number(year)));
  h(CH.syncNow, () => core.syncNow());
  h(CH.loginGoogle, () => core.loginGoogle());
  h(CH.cancelLogin, () => core.cancelLogin());
  h(CH.loginDev, (_e, email: string) => core.loginDev(String(email ?? '')));
  h(CH.logout, () => core.logout());
  h(CH.setSettings, (_e, patch) => core.setSettings(patch));
  h(CH.setServerUrl, (_e, url: string) => core.setServerUrl(String(url ?? '')));
  h(CH.hideWindow, () => getWin()?.hide());
  h(CH.netHint, () => core.netHint());
}

/** 자가 점검 전용: 잠깐 topmost로 올렸다가 해제해 일반 창 중 최상단으로 만든다 */
function raiseToTop(win: BrowserWindow): void {
  win.setAlwaysOnTop(true);
  win.setAlwaysOnTop(false);
}

/** CALENDAR_SELFTEST=1: 창을 앞으로 올렸다가 SetWindowPos로 내려 z-order를 로그로 확인하고 종료 */
async function zOrderSelfTest(win: BrowserWindow, zorder: ReturnType<typeof createZOrderController>): Promise<void> {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await new Promise<void>((r) => (win.isVisible() ? r() : win.once('show', () => r())));
  await wait(1500);
  const handle = win.getNativeWindowHandle();
  raiseToTop(win);
  await wait(300);
  console.log('[selftest] moveTop 후:', JSON.stringify(zorder.inspect(handle)));
  const ok = zorder.lowerToBottom(handle);
  await wait(300);
  console.log('[selftest] SetWindowPos 반환:', ok, '/ 호출 후:', JSON.stringify(zorder.inspect(handle)));
  // blur 이벤트 경로 확인: 포커스를 준 뒤 다른 창으로 포커스를 넘기는 것은 자동화가 어려우므로 직접 emit
  raiseToTop(win);
  await wait(200);
  console.log('[selftest] 다시 moveTop 후:', JSON.stringify(zorder.inspect(handle)));
  win.emit('blur');
  await wait(300);
  console.log('[selftest] blur 이벤트 후:', JSON.stringify(zorder.inspect(handle)));
  await uiSelfTest(win);
  console.log('[selftest] 완료');
  app.quit();
}

/** CALENDAR_SELFTEST_EMAIL/CALENDAR_SELFTEST_SHOT: 개발 로그인 + 샘플 메모 생성 후 렌더러 화면을 PNG로 저장 */
async function uiSelfTest(win: BrowserWindow): Promise<void> {
  const shot = process.env.CALENDAR_SELFTEST_SHOT;
  if (!shot) return;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const run = (code: string) => win.webContents.executeJavaScript(code);
  const shoot = async (suffix: string) => {
    const img = await win.webContents.capturePage();
    const file = shot.replace(/.png$/, `-${suffix}.png`);
    require('node:fs').writeFileSync(file, img.toPNG());
    console.log('[selftest] 스크린샷:', file);
  };
  await shoot('login');
  const email = process.env.CALENDAR_SELFTEST_EMAIL;
  if (email) {
    console.log('[selftest] 개발 로그인:', JSON.stringify(await run(`window.calendarApi.loginDev(${JSON.stringify(email)})`)));
    await wait(1500);
    const d = new Date();
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await run(`window.calendarApi.createNote({ date: '${ymd}', content: '자가 점검 메모', color: '#34c38f' })`);
    await wait(1500);
    await shoot('main');
  }
}
