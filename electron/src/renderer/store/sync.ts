import { create } from 'zustand';
import { SyncStatus, NetworkStatus } from '../../shared/types/SyncMeta';

export interface SyncStore extends SyncStatus {
  networkStatus: NetworkStatus | null;
  lastRemoteUpdate: string | null;
  remoteChangeType: 'created' | 'updated' | 'deleted' | null;
  setSyncStatus: (status: SyncStatus) => void;
  setNetworkStatus: (status: NetworkStatus) => void;
  setRemoteUpdate: (changeType: 'created' | 'updated' | 'deleted', timestamp: string) => void;
  clearRemoteUpdate: () => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  syncing: false,
  stage: 'idle',
  error: null,
  lastSync: null,
  unsyncedCount: 0,
  networkStatus: null,
  lastRemoteUpdate: null,
  remoteChangeType: null,

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

  setRemoteUpdate: (changeType: 'created' | 'updated' | 'deleted', timestamp: string) => {
    set({
      lastRemoteUpdate: timestamp,
      remoteChangeType: changeType,
    });
  },

  clearRemoteUpdate: () => {
    set({
      lastRemoteUpdate: null,
      remoteChangeType: null,
    });
  },
}));
