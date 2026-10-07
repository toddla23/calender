import type { LocalStore } from './store';
import { EMPTY_META } from './types';
import type { LocalNoteInput, Note, RemoteNote, SyncMeta } from './types';

/**
 * LocalStore 참조 구현 (메모리). 테스트와 계약 문서 역할.
 * SQLite 구현은 같은 규칙을 SQL로 옮기면 된다 (특히 applyRemoteNotes의 덮어쓰기 규칙과 트랜잭션).
 */
export class MemoryStore implements LocalStore {
  notes = new Map<string, Note>();
  meta: SyncMeta = { ...EMPTY_META };

  async getNote(id: string): Promise<Note | null> {
    const n = this.notes.get(id);
    return n ? { ...n } : null;
  }

  async saveLocalNote(input: LocalNoteInput): Promise<Note> {
    const prev = this.notes.get(input.id);
    const note: Note = {
      ...input,
      serverUpdatedAt: prev?.serverUpdatedAt ?? null,
      synced: false,
      localRev: (prev?.localRev ?? 0) + 1,
    };
    this.notes.set(note.id, note);
    return { ...note };
  }

  async getUnsyncedNotes(limit: number, excludeIds?: ReadonlySet<string>): Promise<Note[]> {
    return [...this.notes.values()]
      .filter((n) => !n.synced && !excludeIds?.has(n.id))
      .sort((a, b) => a.localRev - b.localRev)
      .slice(0, limit)
      .map((n) => ({ ...n }));
  }

  async markSyncedIfUnchanged(id: string, expectedLocalRev: number): Promise<boolean> {
    const n = this.notes.get(id);
    if (!n || n.localRev !== expectedLocalRev) return false;
    n.synced = true;
    return true;
  }

  async applyRemoteNotes(notes: readonly RemoteNote[], metaPatch?: Partial<SyncMeta>): Promise<void> {
    for (const r of notes) {
      const cur = this.notes.get(r.id);
      if (cur && !cur.synced) continue;
      if (cur?.serverUpdatedAt && r.updatedAt < cur.serverUpdatedAt) continue;
      this.notes.set(r.id, { ...r, serverUpdatedAt: r.updatedAt, synced: true, localRev: cur?.localRev ?? 0 });
    }
    if (metaPatch) this.meta = { ...this.meta, ...metaPatch };
  }

  async getMeta(): Promise<SyncMeta> {
    return { ...this.meta };
  }

  async patchMeta(patch: Partial<SyncMeta>): Promise<void> {
    this.meta = { ...this.meta, ...patch };
  }

  async listNotesBetween(from: string, to: string, opts?: { includeDeleted?: boolean }): Promise<Note[]> {
    return [...this.notes.values()]
      .filter((n) => n.date >= from && n.date <= to && (opts?.includeDeleted || !n.deleted))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1))
      .map((n) => ({ ...n }));
  }

  async clearAll(): Promise<void> {
    this.notes.clear();
    this.meta = { ...EMPTY_META };
  }
}
