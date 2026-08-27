import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CRUD_CHANNELS, IPC_SYNC_CHANNELS, IPC_NETWORK_CHANNELS, IPCResponse } from '../shared/types/IPC';
import { CrudHandlers } from './crud';
import { SyncHandlers } from './sync';
import { NetworkHandlers } from './network';

export class IPCHandlerRegistry {
  private crudHandlers: CrudHandlers;
  private syncHandlers: SyncHandlers;
  private networkHandlers: NetworkHandlers;

  constructor() {
    this.crudHandlers = new CrudHandlers();
    this.syncHandlers = new SyncHandlers();
    this.networkHandlers = new NetworkHandlers();
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
