import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotesService } from './notes.service';
import { LocalStorageService } from './local-storage.service';
import { WebSocketService, WebSocketMessage } from './websocket.service';
import { useNotesStore } from '../store/notes';
import { useAuthStore } from '../store/auth';

export type RemoteChangeCallback = (data: { action: string; data: any }) => void;

export class SyncService {
  private static syncInterval: NodeJS.Timeout | null = null;
  private static isOnline: boolean = false;
  private static unsubscribeNetInfo: (() => void) | null = null;
  private static webSocketService: WebSocketService | null = null;
  private static remoteChangeCallbacks: RemoteChangeCallback[] = [];
  private static backendUrl: string = 'http://localhost:8080';

  static async initialize(backendUrl?: string): Promise<void> {
    if (backendUrl) {
      this.backendUrl = backendUrl;
    }

    // Monitor network state
    this.unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      this.isOnline = state.isConnected ?? false;
      console.log('Network state changed:', state.isConnected);

      if (this.isOnline) {
        // Attempt sync when connection is restored
        this.syncPendingNotes();
        // Reconnect WebSocket if needed
        this.reconnectWebSocketIfNeeded();
      }
    });

    // Get initial network state
    const state = await NetInfo.fetch();
    this.isOnline = state.isConnected ?? false;

    // Initialize WebSocket if authenticated
    await this.initializeWebSocket();
  }

  private static async initializeWebSocket(): Promise<void> {
    const authState = useAuthStore.getState();
    if (authState.accessToken && authState.userId) {
      await this.connectWebSocket(authState.accessToken, authState.userId);
    }
  }

  private static async connectWebSocket(accessToken: string, userId: string): Promise<void> {
    if (!this.isOnline) {
      console.log('Offline - skipping WebSocket connection');
      return;
    }

    try {
      if (!this.webSocketService) {
        this.webSocketService = new WebSocketService(this.backendUrl);
        this.setupWebSocketHandlers();
      }

      await this.webSocketService.connect(accessToken, userId);
      console.log('WebSocket connected for real-time sync');
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  }

  private static setupWebSocketHandlers(): void {
    if (!this.webSocketService) return;

    // Handle note created
    this.webSocketService.subscribe('note_created', (message: WebSocketMessage) => {
      console.log('Note created from remote:', message.data);
      this.handleRemoteNoteChange('created', message.data);
    });

    // Handle note updated
    this.webSocketService.subscribe('note_updated', (message: WebSocketMessage) => {
      console.log('Note updated from remote:', message.data);
      this.handleRemoteNoteChange('updated', message.data);
    });

    // Handle note deleted
    this.webSocketService.subscribe('note_deleted', (message: WebSocketMessage) => {
      console.log('Note deleted from remote:', message.data);
      this.handleRemoteNoteChange('deleted', message.data);
    });
  }

  private static handleRemoteNoteChange(action: 'created' | 'updated' | 'deleted', data: any): void {
    // Notify remote change listeners
    this.remoteChangeCallbacks.forEach((callback) => {
      try {
        callback({ action, data });
      } catch (error) {
        console.error(`Error in remote change callback:`, error);
      }
    });

    // Update the store
    const store = useNotesStore.getState();
    try {
      switch (action) {
        case 'created':
          store.addNote(data);
          break;
        case 'updated':
          store.updateNote(data.id, data);
          break;
        case 'deleted':
          // Handle both string ID and object with id property
          const noteId = typeof data === 'string' ? data : data.id;
          store.deleteNote(noteId);
          break;
      }
    } catch (error) {
      console.error(`Error updating store for ${action}:`, error);
    }
  }

  private static async reconnectWebSocketIfNeeded(): Promise<void> {
    if (this.webSocketService && !this.webSocketService.isConnectedStatus()) {
      const authState = useAuthStore.getState();
      if (authState.accessToken && authState.userId) {
        try {
          await this.webSocketService.reconnect(authState.accessToken, authState.userId);
        } catch (error) {
          console.error('Failed to reconnect WebSocket:', error);
        }
      }
    }
  }

  static startAutoSync(intervalMs: number = 30000): void {
    this.stopAutoSync(); // Clear existing interval

    this.syncInterval = setInterval(async () => {
      if (this.isOnline) {
        await this.syncPendingNotes();
      }
    }, intervalMs);

    console.log('Auto sync started with interval:', intervalMs);
  }

  static stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('Auto sync stopped');
    }
  }

  static async syncPendingNotes(): Promise<void> {
    if (!this.isOnline) {
      console.log('Offline - skipping sync');
      return;
    }

    try {
      const pendingNoteIds = await LocalStorageService.getPendingSyncNotes();

      if (pendingNoteIds.length === 0) {
        console.log('No pending notes to sync');
        return;
      }

      console.log(`Syncing ${pendingNoteIds.length} pending notes...`);

      const allNotes = await LocalStorageService.getAllNotes();
      const notesToSync = allNotes.filter((n) => pendingNoteIds.includes(n.id));

      if (notesToSync.length === 0) return;

      const syncedNotes = await NotesService.syncNotes(notesToSync);

      // Update local storage with synced notes
      for (const syncedNote of syncedNotes) {
        syncedNote.synced = true;
        await LocalStorageService.saveNote(syncedNote);
        await LocalStorageService.removePendingSync(syncedNote.id);
      }

      // Update store
      const store = useNotesStore.getState();
      const updatedNotes = store.notes.map((n) => {
        const synced = syncedNotes.find((s) => s.id === n.id);
        return synced ? { ...n, synced: true } : n;
      });
      store.setNotes(updatedNotes);

      console.log(`Successfully synced ${syncedNotes.length} notes`);
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }

  static async forceSyncWithServer(userId: string): Promise<void> {
    if (!this.isOnline) {
      throw new Error('No internet connection');
    }

    try {
      console.log('Force syncing with server...');

      const remoteNotes = await NotesService.getNotes(userId);
      const localNotes = await LocalStorageService.getAllNotes();

      // Merge notes - prefer remote for non-pending notes
      const mergedNotes = this.mergeNotes(localNotes, remoteNotes);

      // Update local storage
      for (const note of mergedNotes) {
        await LocalStorageService.saveNote(note);
      }

      // Update store
      const store = useNotesStore.getState();
      store.setNotes(mergedNotes);

      console.log('Force sync completed');
    } catch (error) {
      console.error('Force sync failed:', error);
      throw error;
    }
  }

  private static mergeNotes(local: any[], remote: any[]): any[] {
    const merged = new Map();

    // Add all remote notes
    remote.forEach((note) => {
      merged.set(note.id, { ...note, synced: true });
    });

    // Add local notes that are pending or newer
    local.forEach((note) => {
      const existing = merged.get(note.id);
      if (!existing || note.synced === false) {
        merged.set(note.id, note);
      }
    });

    return Array.from(merged.values());
  }

  static isNetworkOnline(): boolean {
    return this.isOnline;
  }

  static onRemoteChange(callback: RemoteChangeCallback): () => void {
    this.remoteChangeCallbacks.push(callback);
    return () => {
      this.remoteChangeCallbacks = this.remoteChangeCallbacks.filter((cb) => cb !== callback);
    };
  }

  static async setAuthCredentials(accessToken: string, userId: string): Promise<void> {
    try {
      await this.connectWebSocket(accessToken, userId);
    } catch (error) {
      console.error('Failed to set auth credentials for WebSocket:', error);
    }
  }

  static async disconnectWebSocket(): Promise<void> {
    if (this.webSocketService) {
      try {
        await this.webSocketService.disconnect();
        this.webSocketService = null;
      } catch (error) {
        console.error('Failed to disconnect WebSocket:', error);
      }
    }
  }

  static cleanup(): void {
    this.stopAutoSync();
    this.disconnectWebSocket();
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
    this.remoteChangeCallbacks = [];
  }
}
