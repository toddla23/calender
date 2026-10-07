import { useMemo } from 'react';
import { WEEKDAY_LABELS, type GridCell } from '../../../shared/dates';
import type { Note } from '../../../shared/types';

interface Props {
  grid: GridCell[];
  notes: Note[];
  holidays: Map<string, string>;
  today: string;
  selected: string;
  onSelect(date: string): void;
}

/** 메모의 첫 줄을 제목으로 */
function title(content: string): string {
  return content.split('\n').find((l) => l.trim())?.trim() ?? '(내용 없음)';
}

export function CalendarGrid({ grid, notes, holidays, today, selected, onSelect }: Props) {
  const byDate = useMemo(() => {
    const m = new Map<string, Note[]>();
    for (const n of notes) {
      const l = m.get(n.date);
      if (l) l.push(n);
      else m.set(n.date, [n]);
    }
    return m;
  }, [notes]);

  return (
    <div className="calendar">
      <div className="weekdays">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={w} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid">
        {grid.map((c) => {
          const holiday = holidays.get(c.date);
          const list = byDate.get(c.date) ?? [];
          const cls = [
            'cell',
            c.inMonth ? '' : 'out',
            c.date === today ? 'today' : '',
            c.date === selected ? 'selected' : '',
            c.weekday === 0 || holiday ? 'red' : c.weekday === 6 ? 'blue' : '',
          ].join(' ');
          return (
            <div key={c.date} className={cls} onClick={() => onSelect(c.date)} title={holiday}>
              <div className="num">{c.d}</div>
              {holiday && <div className="holiday">{holiday}</div>}
              <div className="memos">
                {list.slice(0, holiday ? 1 : 2).map((n) => (
                  <div className="memo-line" key={n.id}>
                    <i style={{ background: n.color || 'var(--accent)' }} />
                    <span>{title(n.content)}</span>
                  </div>
                ))}
                {list.length > (holiday ? 1 : 2) && <div className="more">+{list.length - (holiday ? 1 : 2)}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
