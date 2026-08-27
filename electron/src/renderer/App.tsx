import React, { useState, useEffect, useRef } from 'react';
import { Calendar } from './components/Calendar';
import { NotesList } from './components/NotesList';
import { NoteModal } from './components/NoteModal';
import { SyncStatus } from './components/SyncStatus';
import { WidgetSettings } from './components/WidgetSettings';
import { LoginPage } from './pages/LoginPage';
import { useNotesStore } from './store/notes';
import { useSyncStore } from './store/sync';
import { useAuthStore } from './store/auth';
import { Note, NoteInput } from '../shared/types/Note';
import styles from './App.module.css';

export const App: React.FC = () => {
  const { selectedDate, getNotesByDate, loadNotes, addNote, updateNote, deleteNote } = useNotesStore();
  const { isAuthenticated, login, logout, restoreFromStorage } = useAuthStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [textColor, setTextColor] = useState('#333333');
  const [fontSize, setFontSize] = useState(14);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    restoreFromStorage();
    loadAppearance();
  }, [restoreFromStorage]);

  const loadAppearance = async () => {
    try {
      const electron = (globalThis as any).electron;
      if (electron?.config?.getConfig) {
        const config = await electron.config.getConfig();
        setBackgroundColor(config.appearance.backgroundColor);
        setTextColor(config.appearance.textColor);
        setFontSize(config.appearance.fontSize);
      }
    } catch (error) {
      console.error('외형 로드 실패:', error);
    }
  };

  useEffect(() => {
    const handleAppearanceUpdated = (data: any) => {
      setBackgroundColor(data.backgroundColor);
      setTextColor(data.textColor);
      setFontSize(data.fontSize);
    };

    const electron = (globalThis as any).electron;
    if (electron?.config?.onAppearanceUpdated) {
      electron.config.onAppearanceUpdated(handleAppearanceUpdated);
    }
  }, []);

  useEffect(() => {
    const handleLogoutRequired = (event: any) => {
      console.error('Token refresh failed - logging out');
      logout();
    };

    const ipcRenderer = (globalThis as any).electron?.ipc;
    if (ipcRenderer) {
      ipcRenderer.on('auth:logout-required', handleLogoutRequired);
      return () => {
        ipcRenderer.off('auth:logout-required', handleLogoutRequired);
      };
    }
  }, [logout]);

  useEffect(() => {
    if (isAuthenticated) {
      loadNotes(selectedDate);
    }
  }, [selectedDate, loadNotes, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const ipcRenderer = (globalThis as any).electron?.ipc;
    if (!ipcRenderer) return;

    const unsubscribeCreated = ipcRenderer.on('sync:note-created', (data: any) => {
      console.log('Remote note created:', data);
      const note = data.note;
      addNote(note);
    });

    const unsubscribeUpdated = ipcRenderer.on('sync:note-updated', (data: any) => {
      console.log('Remote note updated:', data);
      const note = data.note;
      updateNote(note);
    });

    const unsubscribeDeleted = ipcRenderer.on('sync:note-deleted', (data: any) => {
      console.log('Remote note deleted:', data);
      deleteNote(data.noteId);
    });

    return () => {
      unsubscribeCreated?.();
      unsubscribeUpdated?.();
      unsubscribeDeleted?.();
    };
  }, [isAuthenticated, addNote, updateNote, deleteNote]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-draggable="false"]')) return;
    
    setIsDragging(true);
    dragRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const deltaX = e.clientX - dragRef.current.x;
    const deltaY = e.clientY - dragRef.current.y;

    const newX = containerRef.current.offsetLeft + deltaX;
    const newY = containerRef.current.offsetTop + deltaY;

    containerRef.current.style.left = `${newX}px`;
    containerRef.current.style.top = `${newY}px`;

    dragRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = async () => {
    if (!isDragging || !containerRef.current) return;
    setIsDragging(false);

    const electron = (globalThis as any).electron;
    if (electron?.config?.updatePosition) {
      await electron.config.updatePosition(
        containerRef.current.offsetLeft,
        containerRef.current.offsetTop
      );
    }
  };

  const handleLoginSuccess = async (
    accessToken: string,
    refreshToken: string,
    userId: string,
    userEmail: string
  ) => {
    login(accessToken, refreshToken, userId, userEmail);

    try {
      const window = (globalThis as any).electron;
      if (!window) throw new Error('Electron IPC not available');

      await window.ipc.invoke('sync:set-auth-tokens', {
        accessToken,
        refreshToken,
        userId,
        userEmail,
      });
    } catch (error) {
      console.error('Failed to set auth tokens:', error);
    }
  };

  const handleDateSelect = (date: string) => {
    loadNotes(date);
  };

  const handleNoteClick = (note: Note) => {
    setSelectedNote(note);
    setIsModalOpen(true);
  };

  const handleNewNote = () => {
    setSelectedNote(null);
    setIsModalOpen(true);
  };

  const handleSaveNote = async (noteInput: NoteInput) => {
    try {
      const window = (globalThis as any).electron;
      if (!window) throw new Error('Electron IPC not available');

      if (selectedNote) {
        const response = await window.ipc.invoke('crud:update-note', {
          update: {
            id: selectedNote.id,
            ...noteInput,
          },
        });
        if (response.success) {
          updateNote(response.data);
        }
      } else {
        const response = await window.ipc.invoke('crud:create-note', {
          note: noteInput,
        });
        if (response.success) {
          addNote(response.data);
        }
      }
    } catch (error) {
      console.error('Failed to save note:', error);
      alert('메모 저장에 실패했습니다.');
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      const window = (globalThis as any).electron;
      if (!window) throw new Error('Electron IPC not available');

      const response = await window.ipc.invoke('crud:delete-note', { id });
      if (response.success) {
        deleteNote(id);
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
      alert('메모 삭제에 실패했습니다.');
    }
  };

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const notes = getNotesByDate(selectedDate);

  return (
    <div
      ref={containerRef}
      className={styles.app}
      style={{
        backgroundColor,
        color: textColor,
        fontSize: `${fontSize}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className={styles.container}>
        <div className={styles.toolbar} data-draggable="false">
          <button
            className={styles.settingsBtn}
            onClick={() => setIsSettingsOpen(true)}
            title="위젯 설정"
          >
            ⚙️
          </button>
        </div>

        <div className={styles.left}>
          <Calendar onDateSelect={handleDateSelect} />
        </div>

        <div className={styles.right}>
          <div className={styles.header}>
            <h1 className={styles.title}>{selectedDate}</h1>
            <button className={styles.addButton} onClick={handleNewNote} data-draggable="false">
              + 새 메모
            </button>
          </div>

          <NotesList notes={notes} onNoteClick={handleNoteClick} />
        </div>
      </div>

      <NoteModal
        isOpen={isModalOpen}
        date={selectedDate}
        note={selectedNote}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedNote(null);
        }}
        onSave={handleSaveNote}
        onDelete={handleDeleteNote}
      />

      <WidgetSettings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <SyncStatus />
    </div>
  );
};

export default App;
