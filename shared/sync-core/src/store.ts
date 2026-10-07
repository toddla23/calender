import type { LocalNoteInput, Note, RemoteNote, SyncMeta } from './types';

/**
 * 플랫폼(Electron better-sqlite3 / React Native op-sqlite)이 구현하는 로컬 저장소 계약.
 * 모든 메서드는 Promise를 반환한다 (동기 구현이어도 async로 감쌀 것).
 *
 * 구현 시 반드시 지킬 규칙은 `memory-store.ts`(참조 구현)와 `test/store-contract.ts`
 * (공용 계약 테스트)로 검증할 수 있다.
 */
export interface LocalStore {
  /** 노트 한 건 (삭제된 것 포함). 없으면 null */
  getNote(id: string): Promise<Note | null>;

  /**
   * 사용자 수정을 로컬에 저장한다.
   * - 기존 행이 있으면 localRev = 기존 localRev + 1, 없으면 1
   * - synced = false (Push 큐에 쌓임)
   * - serverUpdatedAt은 기존 값을 유지 (신규면 null)
   * 서버 응답을 기다리지 않고 즉시 호출되며, 화면은 항상 로컬 DB 기준으로 렌더링한다.
   */
  saveLocalNote(input: LocalNoteInput): Promise<Note>;

  /** synced=false인 노트를 localRev 오름차순으로 최대 limit건. excludeIds는 제외 */
  getUnsyncedNotes(limit: number, excludeIds?: ReadonlySet<string>): Promise<Note[]>;

  /**
   * Push 성공 응답을 받은 노트를 synced=true로 표시. 단 현재 localRev가 expectedLocalRev와 같을 때만
   * (응답 대기 중 다시 수정되었으면 false를 반환하고 아무것도 하지 않는다).
   * 서버 응답 확인 전에는 절대 호출하지 않는다.
   */
  markSyncedIfUnchanged(id: string, expectedLocalRev: number): Promise<boolean>;

  /**
   * 서버에서 받은 노트들을 하나의 트랜잭션으로 반영하고, 같은 트랜잭션 안에서 meta를 갱신한다
   * (노트 반영과 cursor 저장이 원자적이어야 부분 Pull 복구 시 중복/손실이 없다).
   *
   * 각 노트의 덮어쓰기 규칙:
   *  - 로컬에 행이 없으면 삽입 (synced=true, localRev=0)
   *  - 로컬 행이 synced=false(미반영 로컬 수정)이면 무시
   *  - 로컬 행이 synced=true이고 (serverUpdatedAt이 null이거나 incoming.updatedAt >= serverUpdatedAt)이면
   *    덮어쓰고 updatedAt = serverUpdatedAt = incoming.updatedAt (서버 시각끼리만 비교하므로
   *    기기 시계 오차와 무관하고, 오래된 이벤트가 최신 값을 되돌리지 못한다)
   */
  applyRemoteNotes(notes: readonly RemoteNote[], metaPatch?: Partial<SyncMeta>): Promise<void>;

  getMeta(): Promise<SyncMeta>;
  patchMeta(patch: Partial<SyncMeta>): Promise<void>;

  /** 기간 조회 (from/to 포함, 'YYYY-MM-DD'). deleted 제외가 기본 */
  listNotesBetween(from: string, to: string, opts?: { includeDeleted?: boolean }): Promise<Note[]>;

  /** 로그아웃 시 로컬 노트, Push 큐, Pull cursor/meta를 모두 초기화 (계정 간 데이터 혼입 방지) */
  clearAll(): Promise<void>;
}
