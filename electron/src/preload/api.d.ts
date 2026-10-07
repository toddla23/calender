import type { AppSnapshot, Holiday, LoginResult, Note, Settings } from '../shared/types';

/** contextBridge로 렌더러에 노출되는 최소 API */
export interface CalendarApi {
  getSnapshot(): Promise<AppSnapshot>;
  listNotes(from: string, to: string, includeDeleted?: boolean): Promise<Note[]>;
  searchNotes(q: string): Promise<Note[]>;
  createNote(d: { date: string; content: string; color?: string }): Promise<Note>;
  updateNote(id: string, patch: { date?: string; content?: string; color?: string }): Promise<Note>;
  deleteNote(id: string): Promise<Note>;
  restoreNote(id: string): Promise<Note>;
  getHolidays(year: number): Promise<Holiday[]>;
  syncNow(): Promise<void>;
  loginGoogle(): Promise<LoginResult>;
  cancelLogin(): Promise<void>;
  loginDev(email: string): Promise<LoginResult>;
  logout(): Promise<void>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  setServerUrl(url: string): Promise<LoginResult>;
  hideWindow(): Promise<void>;
  netHint(): void;
  onSnapshot(cb: (s: AppSnapshot) => void): () => void;
  onNotesChanged(cb: () => void): () => void;
  onHolidaysChanged(cb: () => void): () => void;
}

declare global {
  interface Window {
    calendarApi: CalendarApi;
  }
}
