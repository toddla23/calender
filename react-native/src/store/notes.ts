import { create } from 'zustand';
import { Note } from '../types/Note';

export interface NotesState {
  notes: Note[];
  setNotes: (notes: Note[]) => void;
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (noteId: string) => void;
  getNotesByDate: (date: Date) => Note[];
  searchNotes: (query: string) => Note[];
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],

  setNotes: (notes) => set({ notes }),

  addNote: (note) => {
    const state = get();
    const exists = state.notes.some((n) => n.id === note.id);
    if (!exists) {
      set({ notes: [note, ...state.notes] });
    }
  },

  updateNote: (id, updates) => {
    const state = get();
    const updated = state.notes.map((n) =>
      n.id === id ? { ...n, ...updates } : n
    );
    set({ notes: updated });
  },

  deleteNote: (noteId) => {
    const state = get();
    const filtered = state.notes.filter((n) => n.id !== noteId);
    set({ notes: filtered });
  },

  getNotesByDate: (date) => {
    const state = get();
    const targetDate = new Date(date).toDateString();
    return state.notes.filter((n) => {
      const noteDate = new Date(n.date || n.createdAt).toDateString();
      return noteDate === targetDate;
    });
  },

  searchNotes: (query) => {
    const state = get();
    const lowerQuery = query.toLowerCase();
    return state.notes.filter(
      (n) =>
        n.title.toLowerCase().includes(lowerQuery) ||
        n.content.toLowerCase().includes(lowerQuery)
    );
  },
}));
