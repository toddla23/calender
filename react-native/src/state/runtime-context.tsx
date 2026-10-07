import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Note } from '@calendar/sync-core';
import type { AppRuntime } from '../runtime/runtime';
import { useAppStore } from './app-store';

const RuntimeContext = createContext<AppRuntime | null>(null);

export const RuntimeProvider = ({ runtime, children }: { runtime: AppRuntime; children: React.ReactNode }) => (
  <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>
);

export function useRuntime(): AppRuntime {
  const rt = useContext(RuntimeContext);
  if (!rt) throw new Error('RuntimeProvider가 필요합니다');
  return rt;
}

/** 기간 내 메모 (로컬 DB 조회). notes-changed 때마다 재조회 */
export function useNotesBetween(from: string, to: string, includeDeleted = false): Note[] {
  const rt = useRuntime();
  const version = useAppStore((s) => s.notesVersion);
  const [notes, setNotes] = useState<Note[]>([]);
  useEffect(() => {
    let cancelled = false;
    rt.store
      .listNotesBetween(from, to, { includeDeleted })
      .then((n) => !cancelled && setNotes(n))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [rt, from, to, includeDeleted, version]);
  return notes;
}

/** 공휴일 date → 이름. 로컬 캐시에서 읽고, 온라인이면 백그라운드로 갱신 후 다시 읽는다 */
export function useHolidayMap(years: number[]): Map<string, string> {
  const rt = useRuntime();
  const user = useAppStore((s) => s.user);
  const status = useAppStore((s) => s.syncStatus);
  const [map, setMap] = useState<Map<string, string>>(new Map());
  const key = years.join(',');
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      rt.holidays
        .getMap(years)
        .then((m) => !cancelled && setMap(m))
        .catch(() => {});
    void load();
    if (user && status !== 'offline' && status !== 'auth-expired') {
      rt.refreshHolidays(years)
        .then((changed) => changed && load())
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt, key, user, status === 'offline' || status === 'auth-expired']);
  return map;
}
