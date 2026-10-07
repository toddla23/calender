import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSnapshot, Holiday, Note } from '../../shared/types';

const api = window.calendarApi;

/** main이 보내는 상태 스냅샷 구독 */
export function useSnapshot(): AppSnapshot | null {
  const [snap, setSnap] = useState<AppSnapshot | null>(null);
  useEffect(() => {
    let alive = true;
    void api.getSnapshot().then((s) => alive && setSnap(s));
    const off = api.onSnapshot((s) => setSnap(s));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return snap;
}

/** online/offline 브라우저 이벤트는 값을 믿지 않고 main에 재확인만 요청한다 */
export function useNetHints(): void {
  useEffect(() => {
    const h = () => api.netHint();
    window.addEventListener('online', h);
    window.addEventListener('offline', h);
    return () => {
      window.removeEventListener('online', h);
      window.removeEventListener('offline', h);
    };
  }, []);
}

/** 항상 로컬 DB 조회 결과로 그리고, notes-changed 이벤트에서 다시 조회한다 */
export function useNotesInRange(from: string, to: string, includeDeleted: boolean, enabled = true): Note[] {
  const [notes, setNotes] = useState<Note[]>([]);
  const seq = useRef(0);
  const load = useCallback(() => {
    const my = ++seq.current;
    void api.listNotes(from, to, includeDeleted).then((r) => {
      if (my === seq.current) setNotes(r);
    });
  }, [from, to, includeDeleted]);

  useEffect(() => {
    if (!enabled) return;
    load();
    return api.onNotesChanged(load);
  }, [load, enabled]);
  return notes;
}

/** 연도별 공휴일(로컬 캐시) → 날짜 맵 */
export function useHolidays(years: number[]): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(new Map());
  const key = years.join(',');
  const load = useCallback(() => {
    void Promise.all(years.map((y) => api.getHolidays(y))).then((lists: Holiday[][]) => {
      const m = new Map<string, string>();
      for (const l of lists) for (const h of l) m.set(h.date, h.name);
      setMap(m);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    load();
    return api.onHolidaysChanged(load);
  }, [load]);
  return map;
}
