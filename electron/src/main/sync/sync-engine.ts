import { SyncHandlers } from '../ipc/sync';
import { NetworkMonitor } from './network-monitor';
import { SYNC_CONSTANTS } from '../../shared/sync-core/constants';

export type SyncState = 'idle' | 'syncing' | 'error' | 'paused';
export type SyncStateCallback = (state: SyncState) => void;

export interface SyncEngineConfig {
  backendUrl?: string;
  autoSync?: boolean;
  syncInterval?: number;
}

export class SyncEngine {
  private state: SyncState = 'idle';
  private stateCallbacks: SyncStateCallback[] = [];
  private syncHandlers: SyncHandlers;
  private networkMonitor: NetworkMonitor;
  private syncIntervalId: NodeJS.Timeout | null = null;
  private syncInterval: number;
  private autoSync: boolean;

  constructor(config: SyncEngineConfig = {}) {
    this.syncHandlers = new SyncHandlers(config.backendUrl || 'http://localhost:8080');
    this.networkMonitor = new NetworkMonitor(config.backendUrl);
    this.syncInterval = config.syncInterval || SYNC_CONSTANTS.SYNC_INTERVAL_MS;
    this.autoSync = config.autoSync !== false;

    this.setupNetworkMonitoring();
  }

  private setupNetworkMonitoring(): void {
    this.networkMonitor.subscribe((online) => {
      if (online && this.autoSync && this.state === 'idle') {
        this.sync();
      }
    });
  }

  start(): void {
    this.networkMonitor.startMonitoring();

    if (this.autoSync) {
      this.syncIntervalId = setInterval(() => {
        if (this.state === 'idle' && this.networkMonitor.isOnline()) {
          this.sync();
        }
      }, this.syncInterval);
    }

    this.setState('idle');
  }

  stop(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
    this.networkMonitor.stopMonitoring();
  }

  async sync(): Promise<void> {
    if (this.state === 'syncing') {
      console.log('Sync already in progress, skipping...');
      return;
    }

    if (!this.networkMonitor.isOnline()) {
      this.setState('paused');
      return;
    }

    try {
      this.setState('syncing');

      await this.syncHandlers.pushNotes({});

      await this.syncHandlers.pullNotes({});

      this.setState('idle');
    } catch (error) {
      console.error('Sync error:', error);
      this.setState('error');

      setTimeout(() => {
        if (this.state === 'error' && this.networkMonitor.isOnline()) {
          this.setState('idle');
        }
      }, 5000);
    }
  }

  getState(): SyncState {
    return this.state;
  }

  isOnline(): boolean {
    return this.networkMonitor.isOnline();
  }

  subscribe(callback: SyncStateCallback): () => void {
    this.stateCallbacks.push(callback);

    return () => {
      this.stateCallbacks = this.stateCallbacks.filter((cb) => cb !== callback);
    };
  }

  private setState(state: SyncState): void {
    if (this.state !== state) {
      this.state = state;
      this.notifyCallbacks();
    }
  }

  private notifyCallbacks(): void {
    this.stateCallbacks.forEach((callback) => {
      try {
        callback(this.state);
      } catch (error) {
        console.error('Error in sync state callback:', error);
      }
    });
  }

  destroy(): void {
    this.stop();
    this.networkMonitor.destroy();
    this.stateCallbacks = [];
  }
}
