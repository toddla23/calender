import React, { useState, useEffect } from 'react';
import { Note, NoteInput } from '../../shared/types/Note';
import { useNotesStore } from '../store/notes';
import styles from './NoteModal.module.css';

interface NoteModalProps {
  isOpen: boolean;
  date: string;
  note?: Note | null;
  onClose: () => void;
  onSave: (note: NoteInput) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

const COLORS = ['#FFE082', '#81C784', '#64B5F6', '#FF8A80', '#B39DDB'];

export const NoteModal: React.FC<NoteModalProps> = ({
  isOpen,
  date,
  note,
  onClose,
  onSave,
  onDelete,
}) => {
  const [content, setContent] = useState('');
  const [color, setColor] = useState('#FFE082');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (note) {
      setContent(note.content);
      setColor(note.color || '#FFE082');
    } else {
      setContent('');
      setColor('#FFE082');
    }
  }, [note, isOpen]);

  const handleSave = async () => {
    if (!content.trim()) return;

    setIsSaving(true);
    try {
      await onSave({
        date,
        content,
        color,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save note:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!note || !onDelete) return;

    if (!window.confirm('정말 삭제하시겠습니까?')) return;

    setIsDeleting(true);
    try {
      await onDelete(note.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete note:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{note ? '메모 수정' : '새 메모'}</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.date}>{date}</div>

        <textarea
          className={styles.textarea}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="메모를 입력하세요..."
          style={{ backgroundColor: color }}
        />

        <div className={styles.colorPicker}>
          {COLORS.map((c) => (
            <button
              key={c}
              className={`${styles.colorButton} ${
                color === c ? styles.selected : ''
              }`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}
        </div>

        <div className={styles.footer}>
          {note && onDelete && (
            <button
              className={styles.deleteButton}
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? '삭제 중...' : '삭제'}
            </button>
          )}
          <div className={styles.actions}>
            <button className={styles.cancelButton} onClick={onClose}>
              취소
            </button>
            <button
              className={styles.saveButton}
              onClick={handleSave}
              disabled={!content.trim() || isSaving}
            >
              {isSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
