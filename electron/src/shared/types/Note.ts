export interface Note {
  id: string;              // UUID
  date: string;            // YYYY-MM-DD
  content: string;
  color?: string;          // #RRGGBB
  deleted: boolean;
  deleted_version: number;
  updated_at: string;      // ISO 8601 UTC
  synced: number;          // 0 or 1
  created_at: string;      // ISO 8601 UTC
}

export interface NoteInput {
  date: string;
  content: string;
  color?: string;
}

export interface NoteUpdate {
  id: string;
  content?: string;
  color?: string;
  deleted?: boolean;
  deleted_version?: number;
}
