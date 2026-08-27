import { AuthService } from './auth.service';
import { Note } from '../types/Note';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export class NotesService {
  static async getNotes(userId: string): Promise<Note[]> {
    try {
      const apiClient = AuthService.getApiClient();
      const response = await apiClient.get(`/notes?userId=${userId}`);
      return response.data || [];
    } catch (error) {
      console.error('Failed to fetch notes:', error);
      throw error;
    }
  }

  static async getNoteById(noteId: string): Promise<Note> {
    try {
      const apiClient = AuthService.getApiClient();
      const response = await apiClient.get(`/notes/${noteId}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch note ${noteId}:`, error);
      throw error;
    }
  }

  static async createNote(note: Partial<Note>): Promise<Note> {
    try {
      const apiClient = AuthService.getApiClient();
      const response = await apiClient.post('/notes', note);
      return response.data;
    } catch (error) {
      console.error('Failed to create note:', error);
      throw error;
    }
  }

  static async updateNote(noteId: string, note: Partial<Note>): Promise<Note> {
    try {
      const apiClient = AuthService.getApiClient();
      const response = await apiClient.put(`/notes/${noteId}`, note);
      return response.data;
    } catch (error) {
      console.error(`Failed to update note ${noteId}:`, error);
      throw error;
    }
  }

  static async deleteNote(noteId: string): Promise<void> {
    try {
      const apiClient = AuthService.getApiClient();
      await apiClient.delete(`/notes/${noteId}`);
    } catch (error) {
      console.error(`Failed to delete note ${noteId}:`, error);
      throw error;
    }
  }

  static async syncNotes(notes: Note[]): Promise<Note[]> {
    try {
      const apiClient = AuthService.getApiClient();
      const response = await apiClient.post('/sync/notes', { notes });
      return response.data || [];
    } catch (error) {
      console.error('Failed to sync notes:', error);
      throw error;
    }
  }
}
