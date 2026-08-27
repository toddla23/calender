import { SyncStatus } from '../../shared/types/SyncMeta';
import { PushNotesRequest, PullNotesRequest, SetAuthTokensRequest } from '../../shared/types/IPC';
import { NotesRepository } from '../db/queries/notes';
import { SyncMetaRepository } from '../db/queries/sync-meta';
import { HttpClient, HttpClientConfig } from '../api/http-client';
import { RetryUtil } from '../api/retry';
import { TokenManager } from '../api/token-manager';
import { PushService, PushResponse } from '../../shared/sync-core/push';
import { PullService, PullResponse } from '../../shared/sync-core/pull';
import { ConflictResolver } from '../../shared/sync-core/conflict';

export class SyncHandlers {
  private syncStatus: SyncStatus = {
    syncing: false,
    stage: 'idle',
    error: null,
    lastSync: null,
    unsyncedCount: 0,
  };

  private notesRepo: NotesRepository;
  private syncMetaRepo: SyncMetaRepository;
  private tokenManager: TokenManager;
  private httpClient: HttpClient | null = null;
  private retryUtil: RetryUtil;

  constructor(backendUrl: string = 'http://localhost:8080') {
    this.notesRepo = new NotesRepository();
    this.syncMetaRepo = new SyncMetaRepository();
    this.tokenManager = new TokenManager();
    this.retryUtil = new RetryUtil();

    const config: HttpClientConfig = {
      baseURL: backendUrl,
      tokenManager: this.tokenManager,
    };
    const meta = this.syncMetaRepo.getSyncMeta();
    if (meta.access_token) {
      config.accessToken = meta.access_token;
    }
    this.httpClient = new HttpClient(config);
  }

  async getSyncStatus(request: any): Promise<SyncStatus> {
    const unsynced = this.notesRepo.getUnsyncedNotes();
    this.syncStatus.unsyncedCount = unsynced.length;
    return this.syncStatus;
  }

  async pushNotes(request: PushNotesRequest): Promise<any> {
    if (!this.httpClient) {
      throw new Error('HTTP client not initialized');
    }

    try {
      this.setSyncStatus('pushing', 'push');

      const unsyncedNotes = this.notesRepo.getUnsyncedNotes();

      if (unsyncedNotes.length === 0) {
        this.setSyncStatus('idle', 'push', null);
        return { success: true, pushed: 0 };
      }

      const payload = PushService.preparePushPayload(unsyncedNotes);

      const response = await this.retryUtil.executeWithRetry(async () => {
        return this.httpClient!.post<PushResponse>('/api/sync/push', payload);
      });

      const validatedResponse = PushService.validateResponse(response);
      const successfulIds = PushService.getSuccessfulIds(validatedResponse);

      this.notesRepo.markAsSynced(successfulIds);

      const meta = this.syncMetaRepo.getSyncMeta();
      this.syncMetaRepo.setLastSyncedAt(new Date().toISOString());

      this.setSyncStatus('idle', 'push', null);

      return {
        success: successfulIds.length > 0,
        pushed: successfulIds.length,
        failed: unsyncedNotes.length - successfulIds.length,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.setSyncStatus('idle', 'push', errorMsg);
      throw error;
    }
  }

  async pullNotes(request: PullNotesRequest): Promise<any> {
    if (!this.httpClient) {
      throw new Error('HTTP client not initialized');
    }

    try {
      this.setSyncStatus('pulling', 'pull');

      let allPulled = 0;
      let hasMore = true;
      let cursor: string | null = null;
      let lastServerTime: string | null = null;

      const meta = this.syncMetaRepo.getSyncMeta();
      let lastSyncedAt = meta.last_synced_at;
      cursor = meta.last_pull_cursor;

      this.syncMetaRepo.setPullInProgress(true);

      while (hasMore) {
        const pullRequest = PullService.preparePullRequest(lastSyncedAt, cursor);

        const response = await this.retryUtil.executeWithRetry(async () => {
          const queryString = new URLSearchParams({
            since: pullRequest.since,
            limit: pullRequest.limit.toString(),
            ...(pullRequest.cursor && { cursor: pullRequest.cursor }),
          }).toString();

          return this.httpClient!.get<PullResponse>(`/api/sync/pull?${queryString}`);
        });

        const validatedResponse = PullService.validateResponse(response);

        if (PullService.detectServerTimeRegression(lastServerTime, validatedResponse.server_time)) {
          console.warn('Server time regression detected, continuing...');
        }
        lastServerTime = validatedResponse.server_time;

        for (const serverNote of validatedResponse.items) {
          const localNote = this.notesRepo.getNoteById(serverNote.id);

          const merged = ConflictResolver.mergeNote(
            localNote || PullService.convertToNote(serverNote, 0),
            PullService.convertToNote(serverNote)
          );

          if (localNote) {
            this.notesRepo.updateNote(serverNote.id, {
              ...merged,
              synced: 1,
            });
          } else {
            this.notesRepo.createNote({
              date: merged.date,
              content: merged.content,
              color: merged.color,
            });
          }

          allPulled++;
        }

        this.syncMetaRepo.setLastPullCursor(validatedResponse.next_cursor);
        this.syncMetaRepo.setLastSyncedAt(validatedResponse.server_time);

        hasMore = validatedResponse.has_more;
        cursor = validatedResponse.next_cursor;
      }

      this.syncMetaRepo.setPullInProgress(false);
      this.setSyncStatus('idle', 'pull', null);

      return {
        success: true,
        pulled: allPulled,
      };
    } catch (error) {
      this.syncMetaRepo.setPullInProgress(false);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.setSyncStatus('idle', 'pull', errorMsg);
      throw error;
    }
  }

  async setAuthTokens(request: SetAuthTokensRequest): Promise<void> {
    this.syncMetaRepo.setAuthTokens(
      request.accessToken,
      request.refreshToken,
      request.userId,
      request.userEmail
    );

    if (this.httpClient) {
      this.httpClient.setAccessToken(request.accessToken);
    }
  }

  private setSyncStatus(syncing: boolean | string, stage: string, error: string | null): void {
    this.syncStatus = {
      syncing: syncing === 'pushing' || syncing === 'pulling',
      stage,
      error,
      lastSync: error ? null : new Date().toISOString(),
      unsyncedCount: this.syncStatus.unsyncedCount,
    };
  }
}
