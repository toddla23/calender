export interface SyncMeta {
  id: 1;
  last_synced_at: string | null;      // ISO 8601 UTC or null
  last_pull_cursor: string | null;    // UUID or null
  pull_in_progress: number;           // 0 or 1
  access_token: string | null;
  refresh_token: string | null;
  user_id: string | null;
  user_email: string | null;
  created_at: string;                 // ISO 8601 UTC
}

export interface SyncStatus {
  syncing: boolean;
  stage: 'idle' | 'pushing' | 'pulling';
  error: string | null;
  lastSync: string | null;  // ISO 8601 UTC
  unsyncedCount: number;
}

export interface NetworkStatus {
  online: boolean;
  lastChecked: string;      // ISO 8601 UTC
}
