/** 로컬 DB의 노트 한 건. date는 순수 날짜('YYYY-MM-DD'), 타임존 변환 금지. */
export interface Note {
  id: string;
  date: string;
  content: string;
  color: string;
  deleted: boolean;
  /** Tombstone 버전. 서버가 삭제 시 증가시키며, 클라이언트는 본 값을 그대로 되돌려 보낸다. */
  deletedVersion: number;
  /** 표시용 수정 시각. 로컬 수정 직후엔 기기 시각, 서버에서 받으면 서버 발급 시각. 충돌 해결에는 쓰지 않는다 */
  updatedAt: string;
  /**
   * 마지막으로 서버에서 받은 이 노트의 서버 발급 시각(ISO UTC). 아직 서버에서 받은 적 없으면 null.
   * 로컬 수정이나 Push 성공으로는 바뀌지 않고 Pull/실시간 수신으로만 갱신된다.
   * 덮어쓰기 판단은 항상 "서버 시각 대 서버 시각"으로만 한다 (기기 시계 오차 배제).
   */
  serverUpdatedAt: string | null;
  /** false = 로컬에서 바뀌었지만 아직 서버에 반영되지 않음 (Push 큐) */
  synced: boolean;
  /** 로컬 수정마다 1씩 증가. Push 응답 대기 중 재수정된 노트를 synced=true로 덮어쓰지 않기 위함 */
  localRev: number;
}

/** 서버에서 내려온 노트 (Pull / WebSocket / Push 충돌 응답). */
export interface RemoteNote {
  id: string;
  date: string;
  content: string;
  color: string;
  deleted: boolean;
  deletedVersion: number;
  updatedAt: string;
}

/** 로컬 저장 입력 (store가 localRev/synced를 채운다). */
export interface LocalNoteInput {
  id: string;
  date: string;
  content: string;
  color: string;
  deleted: boolean;
  deletedVersion: number;
  updatedAt: string;
}

export interface SyncMeta {
  /** 서버가 내려준 serverTime을 그대로 저장 */
  lastSyncedAt: string | null;
  /** 부분 Pull 복구용: 마지막으로 반영한 청크의 다음 cursor */
  lastPullCursor: string | null;
  /** Pull 도중 강제 종료 대비 */
  pullInProgress: boolean;
  /** 진행 중인 Pull이 시작될 때의 since (재개 시 동일하게 사용) */
  pullSince: string | null;
}

export const EMPTY_META: SyncMeta = {
  lastSyncedAt: null,
  lastPullCursor: null,
  pullInProgress: false,
  pullSince: null,
};

export interface PushItem {
  id: string;
  date: string;
  content: string;
  color: string;
  deleted: boolean;
  deletedVersion: number;
}

export interface PushResult {
  id: string;
  success: boolean;
  /** CONFLICT_DELETED | FORBIDDEN | INTERNAL_ERROR ... */
  error?: string;
  /** CONFLICT_DELETED일 때 서버의 현재 상태 */
  note?: RemoteNote;
}

export interface PullRequest {
  since: string | null;
  cursor: string | null;
  limit: number;
}

export interface PullResponse {
  items: RemoteNote[];
  nextCursor: string | null;
  hasMore: boolean;
  serverTime: string;
}

/** WebSocket broadcast 메시지 */
export interface RealtimeEvent {
  type: 'UPSERT';
  note: RemoteNote;
  originDeviceId: string | null;
  originConnectionId: string | null;
}

export interface Holiday {
  date: string;
  name: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'auth-expired';

export type SyncEvent =
  | { type: 'status'; status: SyncStatus }
  | { type: 'notes-changed' }
  /** 신규 기기 최초 Pull 등 진행률 표시용 */
  | { type: 'pull-progress'; received: number }
  | { type: 'warning'; code: 'SERVER_CLOCK_REGRESSED'; detail: string };
