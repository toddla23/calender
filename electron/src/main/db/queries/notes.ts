import { SQLiteDB } from '../sqlite';
import { Note, NoteInput } from '../../../shared/types/Note';
import { v4 as uuidv4 } from 'uuid';

export class NotesRepository {
  private db: SQLiteDB;

  constructor() {
    this.db = SQLiteDB.getInstance();
  }

  createNote(input: NoteInput): Note {
    const id = uuidv4();
    const now = new Date().toISOString();

    const note: Note = {
      id,
      date: input.date,
      content: input.content,
      color: input.color,
      deleted: false,
      deleted_version: 0,
      updated_at: now,
      synced: 0,
      created_at: now,
    };

    this.db.run(
      `INSERT INTO notes (id, date, content, color, deleted, deleted_version, updated_at, synced, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        note.id,
        note.date,
        note.content,
        note.color || null,
        note.deleted ? 1 : 0,
        note.deleted_version,
        note.updated_at,
        note.synced,
        note.created_at,
      ]
    );

    return note;
  }

  readNotes(startDate?: string, endDate?: string, includeDeleted: boolean = false): Note[] {
    let sql = 'SELECT * FROM notes WHERE 1=1';
    const params: any[] = [];

    if (startDate) {
      sql += ' AND date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND date <= ?';
      params.push(endDate);
    }

    if (!includeDeleted) {
      sql += ' AND deleted = 0';
    }

    sql += ' ORDER BY date ASC, updated_at DESC';

    return this.db.all(sql, params).map(this.rowToNote);
  }

  getNoteById(id: string): Note | null {
    const row = this.db.get('SELECT * FROM notes WHERE id = ?', [id]);
    return row ? this.rowToNote(row) : null;
  }

  getNotesByDate(date: string): Note[] {
    return this.db.all('SELECT * FROM notes WHERE date = ? AND deleted = 0 ORDER BY updated_at DESC', [date])
      .map(this.rowToNote);
  }

  updateNote(id: string, updates: Partial<Note>): Note {
    const existing = this.getNoteById(id);
    if (!existing) throw new Error(`Note not found: ${id}`);

    const now = new Date().toISOString();
    const deleted = updates.deleted !== undefined ? updates.deleted : existing.deleted;
    const deletedVersion = this.calculateDeletedVersion(existing, deleted, updates.deleted_version);

    const note: Note = {
      ...existing,
      ...updates,
      deleted,
      deleted_version: deletedVersion,
      updated_at: now,
      synced: 0, // 로컬 변경 표시
    };

    this.db.run(
      `UPDATE notes
       SET content = ?, color = ?, deleted = ?, deleted_version = ?, updated_at = ?, synced = ?
       WHERE id = ?`,
      [
        note.content,
        note.color || null,
        note.deleted ? 1 : 0,
        note.deleted_version,
        note.updated_at,
        note.synced,
        id,
      ]
    );

    return note;
  }

  deleteNote(id: string): Note {
    const existing = this.getNoteById(id);
    if (!existing) throw new Error(`Note not found: ${id}`);

    const now = new Date().toISOString();
    const deletedVersion = existing.deleted_version + (existing.deleted ? 0 : 1);

    const note: Note = {
      ...existing,
      deleted: true,
      deleted_version: deletedVersion,
      updated_at: now,
      synced: 0,
    };

    this.db.run(
      `UPDATE notes
       SET deleted = 1, deleted_version = ?, updated_at = ?, synced = 0
       WHERE id = ?`,
      [deletedVersion, now, id]
    );

    return note;
  }

  getUnsyncedNotes(): Note[] {
    return this.db.all('SELECT * FROM notes WHERE synced = 0 ORDER BY updated_at ASC')
      .map(this.rowToNote);
  }

  markAsSynced(ids: string[]): void {
    if (ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(',');
    this.db.run(
      `UPDATE notes SET synced = 1 WHERE id IN (${placeholders})`,
      ids
    );
  }

  private rowToNote(row: any): Note {
    return {
      id: row.id,
      date: row.date,
      content: row.content,
      color: row.color,
      deleted: row.deleted === 1,
      deleted_version: row.deleted_version,
      updated_at: row.updated_at,
      synced: row.synced,
      created_at: row.created_at,
    };
  }

  private calculateDeletedVersion(
    existing: Note,
    newDeleted: boolean,
    newVersion?: number
  ): number {
    if (newDeleted && !existing.deleted) {
      // 삭제 전환: 버전 증가
      return existing.deleted_version + 1;
    }
    if (!newDeleted && existing.deleted) {
      // 삭제 해제 (복구): 버전 유지 또는 제공된 버전 사용
      return newVersion !== undefined ? newVersion : existing.deleted_version;
    }
    // 다른 필드 수정: 버전 유지
    return existing.deleted_version;
  }
}
