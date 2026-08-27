import { BrowserWindow } from 'electron';
import { WidgetManager } from '../windows/widget-manager';
import { SetWindowLevelRequest, SetOpacityRequest } from '../../shared/types/IPC';

export class WindowHandlers {
  private widgetManager: WidgetManager | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.widgetManager = new WidgetManager(mainWindow);
  }

  async setWindowLevel(request: SetWindowLevelRequest): Promise<void> {
    if (!this.widgetManager) {
      throw new Error('Widget manager not initialized');
    }
    this.widgetManager.setWindowLevel(request.level);
  }

  async setOpacity(request: SetOpacityRequest): Promise<void> {
    if (!this.widgetManager) {
      throw new Error('Widget manager not initialized');
    }
    this.widgetManager.setOpacity(request.opacity);
  }

  async toggleAlwaysOnTop(): Promise<void> {
    if (!this.widgetManager) {
      throw new Error('Widget manager not initialized');
    }
    this.widgetManager.toggleAlwaysOnTop();
  }

  async getWindowStatus(): Promise<any> {
    if (!this.widgetManager) {
      throw new Error('Widget manager not initialized');
    }
    return this.widgetManager.getStatus();
  }
}
