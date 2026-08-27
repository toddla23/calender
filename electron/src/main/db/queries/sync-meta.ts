import { SQLiteDB } from '../sqlite';
import { SyncMeta } from '../../../shared/types/SyncMeta';

export class SyncMetaRepository {
  private db: SQLiteDB;

  constructor() {
    this.db = SQLiteDB.getInstance();
  }

  getSyncMeta(): SyncMeta {
    const row = this.db.get('SELECT * FROM sync_meta WHERE id = 1');
    if (!row) throw new Error('SyncMeta not initialized');

    return this.rowToSyncMeta(row);
  }

  setLastSyncedAt(timestamp: string): void {
    this.db.run(
      'UPDATE sync_meta SET last_synced_at = ? WHERE id = 1',
      [timestamp]
    );
  }

  setLastPullCursor(cursor: string | null): void {
    this.db.run(
      'UPDATE sync_meta SET last_pull_cursor = ? WHERE id = 1',
      [cursor]
    );
  }

  setPullInProgress(inProgress: boolean): void {
    this.db.run(
      'UPDATE sync_meta SET pull_in_progress = ? WHERE id = 1',
      [inProgress ? 1 : 0]
    );
  }

  setAuthTokens(accessToken: string, refreshToken: string, userId: string, userEmail: string): void {
    this.db.run(
      `UPDATE sync_meta
       SET access_token = ?, refresh_token = ?, user_id = ?, user_email = ?
       WHERE id = 1`,
      [accessToken, refreshToken, userId, userEmail]
    );
  }

  clearAuthTokens(): void {
    this.db.run(
      `UPDATE sync_meta
       SET access_token = NULL, refresh_token = NULL, user_id = NULL, user_email = NULL,
           last_synced_at = NULL, last_pull_cursor = NULL, pull_in_progress = 0
       WHERE id = 1`,
      []
    );
  }

  getAccessToken(): string | null {
    const meta = this.getSyncMeta();
    return meta.access_token;
  }

  getRefreshToken(): string | null {
    const meta = this.getSyncMeta();
    return meta.refresh_token;
  }

  private rowToSyncMeta(row: any): SyncMeta {
    return {
      id: 1,
      last_synced_at: row.last_synced_at,
      last_pull_cursor: row.last_pull_cursor,
      pull_in_progress: row.pull_in_progress,
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      user_id: row.user_id,
      user_email: row.user_email,
      created_at: row.created_at,
    };
  }
}
