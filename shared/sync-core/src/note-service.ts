import { NoteDeletedError, NoteNotFoundError } from './errors';
import type { SyncEngine } from './engine';
import type { LocalStore } from './store';
import type { Note } from './types';

export interface NoteServiceOptions {
  store: LocalStore;
  engine: SyncEngine;
  /** UUID v4 생성기. 오프라인 생성 대비로 id는 항상 클라이언트가 만든다 (RN은 react-native-uuid 등 주입) */
  newId: () => string;
  now?: () => Date;
}

export interface NoteDraft {
  date: string;
  content: string;
  color?: string;
}

/**
 * 사용자 수정의 쓰기 경로: 로컬 DB에 즉시 upsert(synced=false) → 화면 즉시 갱신 → 백그라운드 Push 시도.
 * 삭제도 별도 로직이 아니라 deleted=true로 세팅하는 "수정"과 동일하다.
 * 삭제된 항목은 수정할 수 없고 복구(restore)만 가능하다 (Tombstone 버전닝).
 */
export class NoteService {
  private readonly now: () => Date;

  constructor(private readonly o: NoteServiceOptions) {
    this.now = o.now ?? (() => new Date());
  }

  async create(draft: NoteDraft): Promise<Note> {
    const note = await this.o.store.saveLocalNote({
      id: this.o.newId(),
      date: draft.date,
      content: draft.content,
      color: draft.color ?? '',
      deleted: false,
      deletedVersion: 0,
      updatedAt: this.now().toISOString(),
    });
    this.o.engine.notifyLocalChange();
    return note;
  }

  async update(id: string, patch: Partial<NoteDraft>): Promise<Note> {
    const cur = await this.require(id);
    if (cur.deleted) throw new NoteDeletedError(id);
    const note = await this.o.store.saveLocalNote({
      id,
      date: patch.date ?? cur.date,
      content: patch.content ?? cur.content,
      color: patch.color ?? cur.color,
      deleted: false,
      deletedVersion: cur.deletedVersion,
      updatedAt: this.now().toISOString(),
    });
    this.o.engine.notifyLocalChange();
    return note;
  }

  async delete(id: string): Promise<Note> {
    const cur = await this.require(id);
    if (cur.deleted) return cur;
    const note = await this.o.store.saveLocalNote({
      id,
      date: cur.date,
      content: cur.content,
      color: cur.color,
      deleted: true,
      deletedVersion: cur.deletedVersion,
      updatedAt: this.now().toISOString(),
    });
    this.o.engine.notifyLocalChange();
    return note;
  }

  /** 복구: 클라이언트가 본 tombstone 버전을 그대로 보내면 서버가 의도적 복구로 인정한다. */
  async restore(id: string): Promise<Note> {
    const cur = await this.require(id);
    if (!cur.deleted) return cur;
    const note = await this.o.store.saveLocalNote({
      id,
      date: cur.date,
      content: cur.content,
      color: cur.color,
      deleted: false,
      deletedVersion: cur.deletedVersion,
      updatedAt: this.now().toISOString(),
    });
    this.o.engine.notifyLocalChange();
    return note;
  }

  listBetween(from: string, to: string, includeDeleted = false): Promise<Note[]> {
    return this.o.store.listNotesBetween(from, to, { includeDeleted });
  }

  private async require(id: string): Promise<Note> {
    const n = await this.o.store.getNote(id);
    if (!n) throw new NoteNotFoundError(id);
    return n;
  }
}
