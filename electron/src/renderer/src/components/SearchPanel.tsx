import { useEffect, useState } from 'react';
import type { Note } from '../../../shared/types';

const api = window.calendarApi;

export function SearchPanel({ onPick }: { onPick(date: string): void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Note[]>([]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      void api.searchNotes(q).then((r) => alive && setResults(r));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  // 동기화로 내용이 바뀌면 결과도 갱신
  useEffect(() => api.onNotesChanged(() => void api.searchNotes(q).then(setResults)), [q]);

  return (
    <div className="day-panel">
      <input autoFocus className="search-input" placeholder="메모 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="notes">
        {q.trim() && results.length === 0 && <div className="empty">검색 결과가 없습니다</div>}
        {results.map((n) => (
          <div key={n.id} className="note" onClick={() => onPick(n.date)}>
            <i className="dot" style={{ background: n.color || 'var(--accent)' }} />
            <div className="note-text">
              <small className="muted">{n.date}</small>
              <br />
              {n.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
