import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { IPCHandlerRegistry } from './ipc/handlers';
import { SyncEngine } from './sync/sync-engine';
import { TokenManager } from './api/token-manager';

let mainWindow: BrowserWindow | null = null;
let syncEngine: SyncEngine | null = null;
let tokenManager: TokenManager | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev = process.env.NODE_ENV === 'development';
  const startUrl = isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, '../renderer/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.on('ready', () => {
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

    // Setup real-time sync event forwarding to renderer
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
