import { Note } from '../types/Note';
import { SYNC_CONSTANTS } from './constants';

export interface PullRequest {
  since: string;        // ISO 8601 UTC
  cursor?: string | null;
  limit: number;
}

export interface PullResponse {
  items: PullNoteItem[];
  next_cursor: string | null;
  has_more: boolean;
  server_time: string;  // ISO 8601 UTC
}

export interface PullNoteItem {
  id: string;
  date: string;
  content: string;
  color?: string;
  deleted: boolean;
  deleted_version: number;
  updated_at: string;
}

export interface PullChunk {
  notes: PullNoteItem[];
  nextCursor: string | null;
  hasMore: boolean;
  serverTime: string;
}

export class PullService {
  static preparePullRequest(
    lastSyncedAt: string | null,
    cursor?: string | null,
    limit: number = SYNC_CONSTANTS.CHUNK_SIZE
  ): PullRequest {
    return {
      since: lastSyncedAt || '1970-01-01T00:00:00Z',
      cursor: cursor || undefined,
      limit: Math.min(limit, SYNC_CONSTANTS.MAX_CHUNK_SIZE),
    };
  }

  static validateResponse(response: any): PullResponse {
    if (!Array.isArray(response.items)) {
      throw new Error('Invalid pull response: missing items array');
    }

    if (typeof response.has_more !== 'boolean') {
      throw new Error('Invalid pull response: has_more must be boolean');
    }

    if (!response.server_time) {
      throw new Error('Invalid pull response: missing server_time');
    }

    const items: PullNoteItem[] = response.items.map((item: any) => {
      if (!item.id || !item.date) {
        throw new Error('Invalid note item: missing id or date');
      }
      return {
        id: item.id,
        date: item.date,
        content: item.content,
        color: item.color,
        deleted: item.deleted === true,
        deleted_version: item.deleted_version || 0,
        updated_at: item.updated_at,
      };
    });

    return {
      items,
      next_cursor: response.next_cursor || null,
      has_more: response.has_more,
      server_time: response.server_time,
    };
  }

  static convertToNote(item: PullNoteItem, synced: number = 1): Note {
    return {
      id: item.id,
      date: item.date,
      content: item.content,
      color: item.color,
      deleted: item.deleted,
      deleted_version: item.deleted_version,
      updated_at: item.updated_at,
      synced,
      created_at: new Date().toISOString(),
    };
  }

  static detectServerTimeRegression(
    previousServerTime: string | null,
    currentServerTime: string
  ): boolean {
    if (!previousServerTime) {
      return false;
    }

    const prevTime = new Date(previousServerTime).getTime();
    const currTime = new Date(currentServerTime).getTime();

    return currTime < prevTime;
  }
}
