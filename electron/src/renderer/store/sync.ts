import { create } from 'zustand';
import { SyncStatus, NetworkStatus } from '../../shared/types/SyncMeta';

export interface SyncStore extends SyncStatus {
  networkStatus: NetworkStatus | null;
  setSyncStatus: (status: SyncStatus) => void;
  setNetworkStatus: (status: NetworkStatus) => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  syncing: false,
  stage: 'idle',
  error: null,
  lastSync: null,
  unsyncedCount: 0,
  networkStatus: null,

  setSyncStatus: (status: SyncStatus) => {
    set({
      syncing: status.syncing,
      stage: status.stage,
      error: status.error,
      lastSync: status.lastSync,
      unsyncedCount: status.unsyncedCount,
    });
  },

  setNetworkStatus: (status: NetworkStatus) => {
    set({ networkStatus: status });
  },
}));
