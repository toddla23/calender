import { BrowserWindow } from 'electron';
import os from 'os';

// koffi는 선택적 - Windows에서만 필요
let koffi: any = null;
try {
  koffi = require('koffi');
} catch (error) {
  // koffi 로드 실패 - Windows가 아니거나 빌드 환경 문제
}

const HWND_NOTOPMOST = -2;
const HWND_TOPMOST = -1;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;

/**
 * Windows 위젯 배치 관리
 * - 앞뒤로 전환 가능한 오버레이 윈도우
 * - 투명도 설정
 */
export class WidgetManager {
  private mainWindow: BrowserWindow | null;
  private isAlwaysOnTop = false;
  private isTransparent = false;
  private user32: any | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.initializeUser32();
  }

  private initializeUser32(): void {
    if (os.platform() !== 'win32') return;

    try {
      this.user32 = koffi.load('user32.dll');
    } catch (error) {
      console.warn('Failed to load user32.dll:', error);
    }
  }

  private getWindowHandle(): number | null {
    if (!this.mainWindow) return null;

    try {
      const hwnd = this.mainWindow.getNativeWindowHandle().readUInt32LE(0);
      return hwnd;
    } catch (error) {
      console.error('Failed to get window handle:', error);
      return null;
    }
  }

  toggleAlwaysOnTop(): void {
    if (!this.mainWindow) return;

    this.isAlwaysOnTop = !this.isAlwaysOnTop;
    this.mainWindow.setAlwaysOnTop(this.isAlwaysOnTop);

    console.log(`Always on top: ${this.isAlwaysOnTop}`);
  }

  setAlwaysOnTop(enabled: boolean): void {
    if (!this.mainWindow) return;

    this.isAlwaysOnTop = enabled;
    this.mainWindow.setAlwaysOnTop(enabled);
  }

  toggleTransparency(): void {
    if (!this.mainWindow) return;

    this.isTransparent = !this.isTransparent;
    const opacity = this.isTransparent ? 0.8 : 1.0;
    this.mainWindow.setOpacity(opacity);

    console.log(`Transparency: ${opacity}`);
  }

  setOpacity(opacity: number): void {
    if (!this.mainWindow || opacity < 0.1 || opacity > 1.0) return;

    this.mainWindow.setOpacity(opacity);
  }

  /**
   * Windows z-order 관리 (Windows only)
   * - HWND_TOP: 최상위
   * - HWND_BOTTOM: 최하위
   * - HWND_NOTOPMOST: 일반 창
   */
  setWindowLevel(level: 'top' | 'bottom' | 'normal'): void {
    if (os.platform() !== 'win32') {
      console.warn('z-order management is Windows only');
      return;
    }

    if (!this.user32 || !this.mainWindow) {
      console.warn('user32.dll not loaded or mainWindow is null, using Electron API');
      this.fallbackSetWindowLevel(level);
      return;
    }

    try {
      const hwnd = this.getWindowHandle();
      if (!hwnd) {
        console.warn('Failed to get window handle, using Electron API');
        this.fallbackSetWindowLevel(level);
        return;
      }

      const SetWindowPos = this.user32.func('bool SetWindowPos(void*, void*, int, int, int, int, uint)');
      let insertAfter: number;

      switch (level) {
        case 'top':
          insertAfter = HWND_TOPMOST;
          break;
        case 'bottom':
          insertAfter = 1;
          break;
        case 'normal':
          insertAfter = HWND_NOTOPMOST;
          break;
        default:
          return;
      }

      SetWindowPos(
        hwnd,
        insertAfter,
        0,
        0,
        0,
        0,
        SWP_NOSIZE | SWP_NOMOVE
      );

      console.log(`Window level set to: ${level} (via SetWindowPos)`);
    } catch (error) {
      console.error('SetWindowPos failed:', error);
      this.fallbackSetWindowLevel(level);
    }
  }

  private fallbackSetWindowLevel(level: 'top' | 'bottom' | 'normal'): void {
    if (!this.mainWindow) return;

    switch (level) {
      case 'top':
        this.mainWindow.setAlwaysOnTop(true);
        break;
      case 'bottom':
      case 'normal':
        this.mainWindow.setAlwaysOnTop(false);
        break;
    }

    console.log(`Window level set to: ${level} (via setAlwaysOnTop fallback)`);
  }

  minimize(): void {
    if (!this.mainWindow) return;
    this.mainWindow.minimize();
  }

  maximize(): void {
    if (!this.mainWindow) return;
    this.mainWindow.maximize();
  }

  restore(): void {
    if (!this.mainWindow) return;
    this.mainWindow.restore();
  }

  focus(): void {
    if (!this.mainWindow) return;
    this.mainWindow.focus();
  }

  getStatus() {
    return {
      isAlwaysOnTop: this.isAlwaysOnTop,
      isTransparent: this.isTransparent,
      isVisible: this.mainWindow?.isVisible() ?? false,
      isMinimized: this.mainWindow?.isMinimized() ?? false,
      isMaximized: this.mainWindow?.isMaximized() ?? false,
    };
  }
}
