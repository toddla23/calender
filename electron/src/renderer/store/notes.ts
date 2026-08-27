import { create } from 'zustand';
import { Note } from '../../shared/types/Note';

export interface NotesStore {
  notes: Map<string, Note[]>;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  getNotesByDate: (date: string) => Note[];
  loadNotes: (date: string) => Promise<void>;
  addNote: (note: Note) => void;
  updateNote: (note: Note) => void;
  deleteNote: (id: string) => void;
  clearNotes: () => void;
}

export const useNotesStore = create<NotesStore>((set, get) => ({
  notes: new Map(),
  selectedDate: new Date().toISOString().split('T')[0],

  setSelectedDate: (date: string) => {
    set({ selectedDate: date });
  },

  getNotesByDate: (date: string) => {
    const { notes } = get();
    return notes.get(date) || [];
  },

  loadNotes: async (date: string) => {
    try {
      const window = (globalThis as any).electron;
      if (!window) return;

      const response = await window.ipc.invoke('crud:get-note-by-date', { date });

      if (response.success) {
        const notes = response.data as Note[];
        set((state) => {
          const newNotes = new Map(state.notes);
          newNotes.set(date, notes);
          return { notes: newNotes };
        });
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
    }
  },

  addNote: (note: Note) => {
    set((state) => {
      const newNotes = new Map(state.notes);
      const dateNotes = newNotes.get(note.date) || [];
      newNotes.set(note.date, [...dateNotes, note]);
      return { notes: newNotes };
    });
  },

  updateNote: (note: Note) => {
    set((state) => {
      const newNotes = new Map(state.notes);
      const dateNotes = newNotes.get(note.date) || [];
      const index = dateNotes.findIndex((n) => n.id === note.id);
      if (index >= 0) {
        dateNotes[index] = note;
      }
      newNotes.set(note.date, dateNotes);
      return { notes: newNotes };
    });
  },

  deleteNote: (id: string) => {
    set((state) => {
      const newNotes = new Map(state.notes);
      newNotes.forEach((dateNotes, date) => {
        const index = dateNotes.findIndex((n) => n.id === id);
        if (index >= 0) {
          dateNotes.splice(index, 1);
        }
      });
      return { notes: newNotes };
    });
  },

  clearNotes: () => {
    set({ notes: new Map() });
  },
}));
