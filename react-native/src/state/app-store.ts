import { create } from 'zustand';
import type { SyncStatus } from '@calendar/sync-core';
import type { AuthUser } from '../runtime/auth';
import type { AppRuntime, RuntimeEvent } from '../runtime/runtime';

export interface AppStoreState {
  phase: 'booting' | 'ready' | 'fatal';
  fatalMessage: string | null;
  user: AuthUser | null;
  syncStatus: SyncStatus;
  /** 최초 Pull 등 진행 중 수신 건수 (진행 중이 아니면 null) */
  pullReceived: number | null;
  warning: string | null;
  /** notes-changed 이벤트마다 증가 → 화면이 이 값을 의존성으로 로컬 DB를 재조회 */
  notesVersion: number;
  unsynced: number;
  /** 홈 캘린더가 공휴일을 다시 읽도록 하는 카운터 */
  holidaysVersion: number;
}

export const useAppStore = create<AppStoreState>(() => ({
  phase: 'booting',
  fatalMessage: null,
  user: null,
  syncStatus: 'idle',
  pullReceived: null,
  warning: null,
  notesVersion: 0,
  unsynced: 0,
  holidaysVersion: 0,
}));

const set = useAppStore.setState;

/** 런타임 이벤트 → 전역 상태 반영. 해제 함수를 반환한다 */
export function bindRuntimeToStore(rt: AppRuntime): () => void {
  const refreshUnsynced = () => {
    rt.store
      .countUnsynced()
      .then((n) => set({ unsynced: n }))
      .catch(() => {});
  };
  const off = rt.on((e: RuntimeEvent) => {
    switch (e.type) {
      case 'status':
        set((s) => ({ syncStatus: e.status, pullReceived: e.status === 'syncing' ? s.pullReceived : null }));
        if (e.status === 'idle') set({ warning: null });
        refreshUnsynced();
        break;
      case 'notes-changed':
        set((s) => ({ notesVersion: s.notesVersion + 1 }));
        refreshUnsynced();
        break;
      case 'pull-progress':
        set({ pullReceived: e.received });
        break;
      case 'warning':
        set({ warning: e.detail });
        break;
      case 'session':
        set((s) => ({
          user: e.user,
          syncStatus: 'idle',
          pullReceived: null,
          warning: null,
          notesVersion: s.notesVersion + 1,
          unsynced: 0,
        }));
        break;
    }
  });
  set({ user: rt.getUser() });
  refreshUnsynced();
  return off;
}
