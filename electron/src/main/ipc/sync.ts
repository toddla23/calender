import { SyncStatus } from '../shared/types/SyncMeta';
import { PushNotesRequest, PullNotesRequest, SetAuthTokensRequest } from '../shared/types/IPC';

export class SyncHandlers {
  private syncStatus: SyncStatus = {
    syncing: false,
    stage: 'idle',
    error: null,
    lastSync: null,
    unsyncedCount: 0,
  };

  async getSyncStatus(request: any): Promise<SyncStatus> {
    // TODO: 실제 구현에서는 DB에서 현재 synced=0인 항목 개수 조회
    return this.syncStatus;
  }

  async pushNotes(request: PushNotesRequest): Promise<any> {
    // TODO: Phase 2-2에서 구현
    // 1. NotesRepository에서 synced=0 항목 조회
    // 2. PushService.preparePushPayload 호출
    // 3. 백엔드에 POST /api/sync/push
    // 4. 응답 검증 및 synced=1 표시
    // 5. 재시도 큐 관리
    throw new Error('Not implemented');
  }

  async pullNotes(request: PullNotesRequest): Promise<any> {
    // TODO: Phase 2-2에서 구현
    // 1. SyncMetaRepository에서 lastSyncedAt, lastPullCursor 조회
    // 2. PullService.preparePullRequest 호출
    // 3. 백엔드에 GET /api/sync/pull
    // 4. 응답 검증 (PullService.validateResponse)
    // 5. 로컬 DB 머지 (ConflictResolver 사용)
    // 6. 메타데이터 업데이트
    // 7. hasMore=true이면 다음 청크 Pull
    throw new Error('Not implemented');
  }

  async setAuthTokens(request: SetAuthTokensRequest): Promise<void> {
    // TODO: Phase 2에서 구현
    // SyncMetaRepository.setAuthTokens 호출
    throw new Error('Not implemented');
  }
}
