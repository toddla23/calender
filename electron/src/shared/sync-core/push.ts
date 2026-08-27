import { Note } from '../types/Note';

export interface PushPayload {
  notes: PushNoteItem[];
}

export interface PushNoteItem {
  id: string;
  date: string;
  content: string;
  color?: string;
  deleted: boolean;
  deleted_version: number;
}

export interface PushResponse {
  results: PushResult[];
}

export interface PushResult {
  id: string;
  success: boolean;
  error?: string;
}

export class PushService {
  static preparePushPayload(unsyncedNotes: Note[]): PushPayload {
    return {
      notes: unsyncedNotes.map((note) => ({
        id: note.id,
        date: note.date,
        content: note.content,
        color: note.color,
        deleted: note.deleted,
        deleted_version: note.deleted_version,
      })),
    };
  }

  static validateResponse(response: any): PushResponse {
    if (!Array.isArray(response)) {
      throw new Error('Invalid push response: expected array');
    }

    const results: PushResult[] = response.map((item: any) => {
      if (!item.id) throw new Error('Invalid push result: missing id');
      return {
        id: item.id,
        success: item.success === true,
        error: item.error || undefined,
      };
    });

    return { results };
  }

  static getSuccessfulIds(response: PushResponse): string[] {
    return response.results
      .filter((r) => r.success)
      .map((r) => r.id);
  }

  static getFailedIds(response: PushResponse): string[] {
    return response.results
      .filter((r) => !r.success)
      .map((r) => r.id);
  }
}
