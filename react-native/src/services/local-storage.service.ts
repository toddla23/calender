import AsyncStorage from '@react-native-async-storage/async-storage';
import { Note } from '../types/Note';

const STORAGE_KEY = 'calendar_notes';
const PENDING_SYNC_KEY = 'calendar_pending_sync';

export class LocalStorageService {
  static async saveNote(note: Note): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const notes: Note[] = stored ? JSON.parse(stored) : [];

      const existingIndex = notes.findIndex((n) => n.id === note.id);
      if (existingIndex >= 0) {
        notes[existingIndex] = note;
      } else {
        notes.push(note);
      }

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(notes));

      // Mark for sync if not synced
      if (!note.synced) {
        await this.addPendingSync(note.id);
      }
    } catch (error) {
      console.error('Failed to save note locally:', error);
      throw error;
    }
  }

  static async getNote(noteId: string): Promise<Note | null> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) return null;

      const notes: Note[] = JSON.parse(stored);
      return notes.find((n) => n.id === noteId) || null;
    } catch (error) {
      console.error('Failed to get note from local storage:', error);
      throw error;
    }
  }

  static async getAllNotes(): Promise<Note[]> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to get all notes from local storage:', error);
      throw error;
    }
  }

  static async deleteNote(noteId: string): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const notes: Note[] = JSON.parse(stored);
      const filtered = notes.filter((n) => n.id !== noteId);

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      await this.removePendingSync(noteId);
    } catch (error) {
      console.error('Failed to delete note from local storage:', error);
      throw error;
    }
  }

  static async addPendingSync(noteId: string): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(PENDING_SYNC_KEY);
      const pending: string[] = stored ? JSON.parse(stored) : [];

      if (!pending.includes(noteId)) {
        pending.push(noteId);
        await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pending));
      }
    } catch (error) {
      console.error('Failed to add pending sync:', error);
    }
  }

  static async removePendingSync(noteId: string): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(PENDING_SYNC_KEY);
      if (!stored) return;

      const pending: string[] = JSON.parse(stored);
      const filtered = pending.filter((id) => id !== noteId);

      await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Failed to remove pending sync:', error);
    }
  }

  static async getPendingSyncNotes(): Promise<string[]> {
    try {
      const stored = await AsyncStorage.getItem(PENDING_SYNC_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to get pending sync notes:', error);
      return [];
    }
  }

  static async clearAllData(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      await AsyncStorage.removeItem(PENDING_SYNC_KEY);
    } catch (error) {
      console.error('Failed to clear all data:', error);
      throw error;
    }
  }
}
