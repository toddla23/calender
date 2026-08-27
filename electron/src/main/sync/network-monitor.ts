import { SYNC_CONSTANTS } from '../../shared/sync-core/constants';

export type NetworkStatusCallback = (online: boolean) => void;

export class NetworkMonitor {
  private online: boolean = true;
  private statusCallbacks: NetworkStatusCallback[] = [];
  private pingIntervalId: NodeJS.Timeout | null = null;
  private backendUrl: string;

  constructor(backendUrl: string = 'http://localhost:8080') {
    this.backendUrl = backendUrl;
    this.setupListeners();
  }

  private setupListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
    }
  }

  startMonitoring(): void {
    this.stopMonitoring();

    this.pingIntervalId = setInterval(() => {
      this.checkConnectivity();
    }, SYNC_CONSTANTS.PING_INTERVAL_MS);

    this.checkConnectivity();
  }

  stopMonitoring(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  private async checkConnectivity(): Promise<void> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SYNC_CONSTANTS.REQUEST_TIMEOUT_MS);

      const response = await fetch(`${this.backendUrl}/api/health`, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok && !this.online) {
        this.handleOnline();
      }
    } catch (error) {
      if (this.online) {
        this.handleOffline();
      }
    }
  }

  private handleOnline(): void {
    if (!this.online) {
      this.online = true;
      this.notifyCallbacks(true);
    }
  }

  private handleOffline(): void {
    if (this.online) {
      this.online = false;
      this.notifyCallbacks(false);
    }
  }

  isOnline(): boolean {
    return this.online;
  }

  subscribe(callback: NetworkStatusCallback): () => void {
    this.statusCallbacks.push(callback);

    return () => {
      this.statusCallbacks = this.statusCallbacks.filter((cb) => cb !== callback);
    };
  }

  private notifyCallbacks(online: boolean): void {
    this.statusCallbacks.forEach((callback) => {
      try {
        callback(online);
      } catch (error) {
        console.error('Error in network status callback:', error);
      }
    });
  }

  destroy(): void {
    this.stopMonitoring();
    this.statusCallbacks = [];
  }
}
