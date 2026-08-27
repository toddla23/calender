import React from 'react';
import { Note } from '../../shared/types/Note';
import styles from './NotesList.module.css';

interface NotesListProps {
  notes: Note[];
  onNoteClick: (note: Note) => void;
}

export const NotesList: React.FC<NotesListProps> = ({ notes, onNoteClick }) => {
  if (notes.length === 0) {
    return (
      <div className={styles.empty}>
        <p>이 날짜에 메모가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {notes.map((note) => (
        <div
          key={note.id}
          className={styles.item}
          onClick={() => onNoteClick(note)}
          style={{ backgroundColor: note.color || '#FFE082' }}
        >
          <div className={styles.content}>{note.content}</div>
          <div className={styles.meta}>
            {note.synced === 0 && <span className={styles.unsynced}>미동기</span>}
          </div>
        </div>
      ))}
    </div>
  );
};
