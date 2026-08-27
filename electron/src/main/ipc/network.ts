import { NetworkStatus } from '../shared/types/SyncMeta';

export class NetworkHandlers {
  private networkStatus: NetworkStatus = {
    online: navigator.onLine || true,
    lastChecked: new Date().toISOString(),
  };

  async getNetworkStatus(request: any): Promise<NetworkStatus> {
    return this.networkStatus;
  }

  updateNetworkStatus(online: boolean): void {
    this.networkStatus = {
      online,
      lastChecked: new Date().toISOString(),
    };
  }
}
