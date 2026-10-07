import { useState } from 'react';
import { dayOfWeek, parseYmd, WEEKDAY_LABELS } from '../../../shared/dates';
import { NOTE_COLORS, type Note } from '../../../shared/types';
import { useNotesInRange } from '../hooks';

const api = window.calendarApi;

function ColorPicker({ value, onChange }: { value: string; onChange(c: string): void }) {
  return (
    <div className="colors">
      {NOTE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch ${value === c ? 'on' : ''}`}
          style={{ background: c }}
          aria-label={`색상 ${c}`}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

function NoteRow({ note }: { note: Note }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.content);
  const [color, setColor] = useState(note.color || NOTE_COLORS[0]);
  const [err, setErr] = useState<string | null>(null);

  if (note.deleted) {
    // 삭제된 메모: 흐리게 표시, 복구만 가능 (수정 비활성)
    return (
      <div className="note deleted">
        <i className="dot" style={{ background: note.color || 'var(--accent)' }} />
        <div className="note-text">{note.content}</div>
        <button className="text-btn" onClick={() => void api.restoreNote(note.id)}>
          복구
        </button>
      </div>
    );
  }

  const save = async () => {
    if (!text.trim()) return;
    try {
      await api.updateNote(note.id, { content: text, color });
      setEditing(false);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (editing) {
    return (
      <div className="note editing">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
        <ColorPicker value={color} onChange={setColor} />
        {err && <div className="error">{err}</div>}
        <div className="row-actions">
          <button className="text-btn" onClick={() => void save()}>
            저장
          </button>
          <button className="text-btn" onClick={() => setEditing(false)}>
            취소
          </button>
          <span className="spacer" />
          <button className="text-btn danger" onClick={() => void api.deleteNote(note.id)}>
            삭제
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="note"
      onClick={() => {
        setText(note.content);
        setColor(note.color || NOTE_COLORS[0]);
        setEditing(true);
      }}
    >
      <i className="dot" style={{ background: note.color || 'var(--accent)' }} />
      <div className="note-text">{note.content}</div>
      {!note.synced && <span className="pending" title="아직 서버에 반영되지 않음">●</span>}
    </div>
  );
}

export function DayPanel({ date, holidayName }: { date: string; holidayName?: string }) {
  const notes = useNotesInRange(date, date, true);
  const [text, setText] = useState('');
  const [color, setColor] = useState<string>(NOTE_COLORS[0]);
  const { m, d } = parseYmd(date);

  const add = async () => {
    const content = text.trim();
    if (!content) return;
    setText('');
    await api.createNote({ date, content, color });
  };

  const active = notes.filter((n) => !n.deleted);
  const removed = notes.filter((n) => n.deleted);

  return (
    <div className="day-panel">
      <div className="day-head">
        <strong>
          {m}월 {d}일 ({WEEKDAY_LABELS[dayOfWeek(date)]})
        </strong>
        {holidayName && <span className="holiday-tag">{holidayName}</span>}
      </div>
      <div className="notes">
        {active.map((n) => (
          <NoteRow key={n.id} note={n} />
        ))}
        {active.length === 0 && removed.length === 0 && <div className="empty">메모가 없습니다</div>}
        {removed.map((n) => (
          <NoteRow key={n.id} note={n} />
        ))}
      </div>
      <div className="composer">
        <textarea
          placeholder="메모 추가 (Ctrl+Enter)"
          value={text}
          rows={2}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void add();
            }
          }}
        />
        <div className="composer-bar">
          <ColorPicker value={color} onChange={setColor} />
          <button className="primary" disabled={!text.trim()} onClick={() => void add()}>
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
