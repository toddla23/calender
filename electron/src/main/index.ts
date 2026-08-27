import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { IPCHandlerRegistry } from './ipc/handlers';
import { SyncEngine } from './sync/sync-engine';
import { TokenManager } from './api/token-manager';
import { setupWindowsStartup } from './startup-registry';
import { ConfigManager } from './config-manager';

let mainWindow: BrowserWindow | null = null;
let syncEngine: SyncEngine | null = null;
let tokenManager: TokenManager | null = null;
let configManager: ConfigManager | null = null;

const createWindow = () => {
  configManager = new ConfigManager();
  const config = configManager.getConfig();

  mainWindow = new BrowserWindow({
    width: 400,
    height: 500,
    x: config.position.x,
    y: config.position.y,
    alwaysOnTop: true,
    skipTaskbar: true,
    frame: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.setOpacity(config.appearance.opacity);

  const isDev = process.env.NODE_ENV === 'development';
  const startUrl = isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, '../renderer/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('move', () => {
    if (mainWindow) {
      const position = mainWindow.getPosition();
      if (configManager) {
        configManager.updatePosition(position[0], position[1]);
      }
    }
  });

  mainWindow.on('resize', () => {
    if (mainWindow && configManager) {
      const [x, y] = mainWindow.getPosition();
      configManager.updatePosition(x, y);
    }
  });
};

ipcMain.handle('config:get', () => {
  if (configManager) {
    return configManager.getConfig();
  }
  return null;
});

ipcMain.handle('config:update-appearance', (_event, backgroundColor: string, opacity: number, textColor: string, fontSize: number) => {
  if (configManager) {
    configManager.updateAppearance(backgroundColor, opacity, textColor, fontSize);
    if (mainWindow) {
      mainWindow.setOpacity(opacity);
      mainWindow.webContents.send('appearance:updated', { backgroundColor, opacity, textColor, fontSize });
    }
  }
});

ipcMain.handle('config:update-position', (_event, x: number, y: number) => {
  if (configManager) {
    configManager.updatePosition(x, y);
  }
});

app.on('ready', () => {
  if (process.platform === 'win32') {
    setupWindowsStartup();
  }

  createWindow();

  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080';
  syncEngine = new SyncEngine({
    backendUrl,
    autoSync: true,
    syncInterval: 30000,
  });

  if (mainWindow) {
    const ipcRegistry = new IPCHandlerRegistry(mainWindow, syncEngine);
    ipcRegistry.register();

    syncEngine.onRemoteChange((data) => {
      if (mainWindow) {
        switch (data.action) {
          case 'created':
            mainWindow.webContents.send('sync:note-created', { note: data.data });
            break;
          case 'updated':
            mainWindow.webContents.send('sync:note-updated', { note: data.data });
            break;
          case 'deleted':
            mainWindow.webContents.send('sync:note-deleted', { noteId: data.data });
            break;
        }
      }
    });
  }

  syncEngine.start();

  tokenManager = new TokenManager();
  tokenManager.onRefreshError(() => {
    if (mainWindow) {
      mainWindow.webContents.send('auth:logout-required', {
        reason: 'Token refresh failed - please log in again',
      });
    }
  });
});

app.on('window-all-closed', () => {
  if (syncEngine) {
    syncEngine.destroy();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
