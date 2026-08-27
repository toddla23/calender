import { NetworkStatus } from '../../shared/types/SyncMeta';
import { NetworkMonitor } from '../sync/network-monitor';

export class NetworkHandlers {
  private networkStatus: NetworkStatus;
  private networkMonitor: NetworkMonitor;

  constructor(backendUrl: string = 'http://localhost:8080') {
    this.networkMonitor = new NetworkMonitor(backendUrl);
    this.networkStatus = {
      online: this.networkMonitor.isOnline(),
      lastChecked: new Date().toISOString(),
    };

    this.networkMonitor.subscribe((online) => {
      this.updateNetworkStatus(online);
    });
  }

  async getNetworkStatus(request: any): Promise<NetworkStatus> {
    return this.networkStatus;
  }

  updateNetworkStatus(online: boolean): void {
    this.networkStatus = {
      online,
      lastChecked: new Date().toISOString(),
    };
  }

  startMonitoring(): void {
    this.networkMonitor.startMonitoring();
  }

  stopMonitoring(): void {
    this.networkMonitor.stopMonitoring();
  }

  isOnline(): boolean {
    return this.networkMonitor.isOnline();
  }

  destroy(): void {
    this.networkMonitor.destroy();
  }
}
