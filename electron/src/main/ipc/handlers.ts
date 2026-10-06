import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CRUD_CHANNELS, IPC_SYNC_CHANNELS, IPC_NETWORK_CHANNELS, IPC_WINDOW_CHANNELS, IPCResponse } from '../../shared/types/IPC';
import { CrudHandlers } from './crud';
import { SyncHandlers } from './sync';
import { NetworkHandlers } from './network';
import { WindowHandlers } from './window';
import { SyncEngine } from '../sync/sync-engine';

export class IPCHandlerRegistry {
  private crudHandlers: CrudHandlers;
  private syncHandlers: SyncHandlers;
  private networkHandlers: NetworkHandlers;
  private windowHandlers: WindowHandlers | null = null;

  constructor(mainWindow?: BrowserWindow, syncEngine?: SyncEngine) {
    this.crudHandlers = new CrudHandlers();
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080';
    this.syncHandlers = new SyncHandlers(backendUrl, syncEngine);
    this.networkHandlers = new NetworkHandlers(backendUrl);
    if (mainWindow) {
      this.windowHandlers = new WindowHandlers(mainWindow);
    }
  }

  setMainWindow(mainWindow: BrowserWindow): void {
    this.windowHandlers = new WindowHandlers(mainWindow);
  }

  setSyncEngine(syncEngine: SyncEngine): void {
    this.syncHandlers.setSyncEngine(syncEngine);
  }

  register(): void {
    // CRUD Handlers
    ipcMain.handle(IPC_CRUD_CHANNELS.CREATE_NOTE, async (event, request) =>
      this.wrapHandler(() => this.crudHandlers.createNote(request))
    );

    ipcMain.handle(IPC_CRUD_CHANNELS.READ_NOTES, async (event, request) =>
      this.wrapHandler(() => this.crudHandlers.readNotes(request))
    );

    ipcMain.handle(IPC_CRUD_CHANNELS.UPDATE_NOTE, async (event, request) =>
      this.wrapHandler(() => this.crudHandlers.updateNote(request))
    );

    ipcMain.handle(IPC_CRUD_CHANNELS.DELETE_NOTE, async (event, request) =>
      this.wrapHandler(() => this.crudHandlers.deleteNote(request))
    );

    ipcMain.handle(IPC_CRUD_CHANNELS.GET_NOTE_BY_DATE, async (event, request) =>
      this.wrapHandler(() => this.crudHandlers.getNoteByDate(request))
    );

    // Sync Handlers
    ipcMain.handle(IPC_SYNC_CHANNELS.GET_SYNC_STATUS, async (event, request) =>
      this.wrapHandler(() => this.syncHandlers.getSyncStatus(request))
    );

    ipcMain.handle(IPC_SYNC_CHANNELS.PUSH_NOTES, async (event, request) =>
      this.wrapHandler(() => this.syncHandlers.pushNotes(request))
    );

    ipcMain.handle(IPC_SYNC_CHANNELS.PULL_NOTES, async (event, request) =>
      this.wrapHandler(() => this.syncHandlers.pullNotes(request))
    );

    ipcMain.handle(IPC_SYNC_CHANNELS.SET_AUTH_TOKENS, async (event, request) =>
      this.wrapHandler(() => this.syncHandlers.setAuthTokens(request))
    );

    // Network Handlers
    ipcMain.handle(IPC_NETWORK_CHANNELS.GET_NETWORK_STATUS, async (event, request) =>
      this.wrapHandler(() => this.networkHandlers.getNetworkStatus(request))
    );

    // Window Handlers
    if (this.windowHandlers) {
      ipcMain.handle(IPC_WINDOW_CHANNELS.SET_WINDOW_LEVEL, async (event, request) =>
        this.wrapHandler(() => this.windowHandlers!.setWindowLevel(request))
      );

      ipcMain.handle(IPC_WINDOW_CHANNELS.SET_OPACITY, async (event, request) =>
        this.wrapHandler(() => this.windowHandlers!.setOpacity(request))
      );

      ipcMain.handle(IPC_WINDOW_CHANNELS.TOGGLE_ALWAYS_ON_TOP, async (event, request) =>
        this.wrapHandler(() => this.windowHandlers!.toggleAlwaysOnTop())
      );

      ipcMain.handle(IPC_WINDOW_CHANNELS.GET_WINDOW_STATUS, async (event, request) =>
        this.wrapHandler(() => this.windowHandlers!.getWindowStatus())
      );
    }
  }

  private async wrapHandler(handler: () => Promise<any>): Promise<IPCResponse> {
    try {
      const data = await handler();
      return {
        success: true,
        data,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: message,
      };
    }
  }
}
