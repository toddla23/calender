import { BrowserWindow } from 'electron';
import os from 'os';

/**
 * Windows 위젯 배치 관리
 * - 앞뒤로 전환 가능한 오버레이 윈도우
 * - 투명도 설정
 */
export class WidgetManager {
  private mainWindow: BrowserWindow | null;
  private isAlwaysOnTop = false;
  private isTransparent = false;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
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

    if (!this.mainWindow) return;

    // TODO: koffi를 사용하여 SetWindowPos 호출
    // 현재는 setAlwaysOnTop으로 대체
    switch (level) {
      case 'top':
        this.mainWindow.setAlwaysOnTop(true);
        break;
      case 'bottom':
        this.mainWindow.setAlwaysOnTop(false);
        break;
      case 'normal':
        this.mainWindow.setAlwaysOnTop(false);
        break;
    }

    console.log(`Window level: ${level}`);
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
