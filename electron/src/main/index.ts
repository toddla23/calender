import { app, BrowserWindow } from 'electron';
import path from 'path';
import { IPCHandlerRegistry } from './ipc/handlers';
import { SyncEngine } from './sync/sync-engine';

let mainWindow: BrowserWindow | null = null;
let syncEngine: SyncEngine | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
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
  const ipcRegistry = new IPCHandlerRegistry();
  ipcRegistry.register();

  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080';
  syncEngine = new SyncEngine({
    backendUrl,
    autoSync: true,
    syncInterval: 30000,
  });
  syncEngine.start();

  createWindow();
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
