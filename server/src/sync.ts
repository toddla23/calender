import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { tx } from './db.js';
import {
  COLORS,
  MAX_NOTE_BYTES,
  isValidDate,
  mergeContents,
  CONFLICT_SEPARATOR,
  type Note,
  type Op,
  type OpResult,
  type PullResponse,
} from './protocol.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HistoryReason = 'edit' | 'merged' | 'conflict_client' | 'restore' | 'import';

export interface SyncDeps {
  pool: Pool;
  historyKeep: number;
  /** 커밋된 변경을 실시간으로 알린다. */
  onChange: (seq: number, note: Note) => void;
}

interface NoteRow extends RowDataPacket {
  date: string;
  content: string;
  color: string | null;
  version: number;
  conflict: number;
  updated_at: Date;
}

function rowToNote(r: NoteRow): Note {
  return {
    date: r.date,
    content: r.content,
    color: (r.color as Note['color']) ?? null,
    version: r.version,
    conflict: !!r.conflict,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

/** op 형식 검사. 문제가 있으면 오류 메시지를 돌려준다. */
export function validateOp(op: unknown): string | null {
  if (!op || typeof op !== 'object') return 'op 형식 오류';
  const o = op as Record<string, unknown>;
  if (typeof o.opId !== 'string' || !UUID_RE.test(o.opId)) return 'opId 는 UUID 여야 합니다';
  if (!isValidDate(o.date)) return 'date 형식 오류';
  if (!Number.isInteger(o.baseVersion) || (o.baseVersion as number) < 0) return 'baseVersion 오류';
  if (o.content !== undefined) {
    if (typeof o.content !== 'string') return 'content 형식 오류';
    if (Buffer.byteLength(o.content, 'utf8') > MAX_NOTE_BYTES) return '메모는 한 칸에 64KB 까지 저장할 수 있습니다';
  }
  if (o.color !== undefined && o.color !== null && !(COLORS as readonly string[]).includes(o.color as string))
    return 'color 값 오류';
  if (o.content === undefined && o.color === undefined && !o.resolveConflict) return '바뀐 내용이 없습니다';
  return null;
}

export class SyncService {
  constructor(private deps: SyncDeps) {}

  /**
   * op 하나를 적용한다.
   * - 같은 opId 가 이미 처리됐으면 저장된 응답을 그대로 돌려준다 (status=duplicate)
   * - baseVersion 이 현재 version 과 다르고 내용도 다르면 두 내용을 합치고 충돌 표시
   * 모든 쓰기는 sync_lock 행을 잠가 직렬화하므로 변경 번호(seq)는 커밋 순서와 일치한다.
   */
  async applyOp(op: Op, deviceId: number | null, reasonOverride?: HistoryReason): Promise<OpResult> {
    const err = validateOp(op);
    if (err) return { opId: (op as Op)?.opId ?? '', status: 'rejected', error: err };

    let changed: { seq: number; note: Note } | null = null;
    const result = await tx(this.deps.pool, async (c) => {
      await c.query('SELECT id FROM sync_lock WHERE id = 1 FOR UPDATE');

      const [dup] = await c.query<RowDataPacket[]>('SELECT response FROM applied_ops WHERE op_id = ?', [op.opId]);
      if (dup.length) {
        const prev = JSON.parse(dup[0].response) as OpResult;
        return { ...prev, status: 'duplicate' } as OpResult;
      }

      const [rows] = await c.query<NoteRow[]>('SELECT * FROM notes WHERE date = ?', [op.date]);
      const cur: Note = rows.length
        ? rowToNote(rows[0])
        : { date: op.date, content: '', color: null, version: 0, conflict: false };

      let content = cur.content;
      let color = cur.color;
      let conflict = cur.conflict;
      let status: OpResult['status'] = 'applied';
      let clientConflictContent: string | null = null;

      if (op.color !== undefined) color = op.color; // 색은 마지막에 쓴 쪽이 이긴다

      if (op.content !== undefined && op.content !== cur.content) {
        if (op.baseVersion === cur.version || cur.content === '') {
          content = op.content;
          if (conflict && !content.includes(CONFLICT_SEPARATOR)) conflict = false;
        } else if (op.content === '') {
          // 내가 지운 사이에 다른 기기가 고쳤다 → 서버 내용을 지키고 충돌 표시
          conflict = true;
          status = 'merged';
          clientConflictContent = op.content;
        } else {
          content = mergeContents(cur.content, op.content);
          conflict = true;
          status = 'merged';
          clientConflictContent = op.content;
        }
      }
      if (op.resolveConflict && op.baseVersion === cur.version) conflict = false;

      const isNoop = content === cur.content && color === cur.color && conflict === cur.conflict;
      let res: OpResult;
      if (isNoop && status === 'applied') {
        res = { opId: op.opId, status, note: cur, seq: null };
      } else {
        const version = cur.version + 1;
        const now = new Date();
        await c.query(
          `INSERT INTO notes (date, content, color, version, conflict, updated_at, device_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE content = VALUES(content), color = VALUES(color), version = VALUES(version),
             conflict = VALUES(conflict), updated_at = VALUES(updated_at), device_id = VALUES(device_id)`,
          [op.date, content, color, version, conflict ? 1 : 0, now, deviceId],
        );
        if (clientConflictContent !== null) {
          await this.addHistory(c, op.date, op.baseVersion, clientConflictContent, color, 'conflict_client', deviceId, now);
        }
        const reason: HistoryReason =
          reasonOverride ?? (status === 'merged' ? 'merged' : op.kind === 'restore' ? 'restore' : 'edit');
        await this.addHistory(c, op.date, version, content, color, reason, deviceId, now);
        const [ins] = await c.query<ResultSetHeader>(
          'INSERT INTO changes (date, version, device_id, created_at) VALUES (?, ?, ?, ?)',
          [op.date, version, deviceId, now],
        );
        const note: Note = { date: op.date, content, color, version, conflict, updatedAt: now.toISOString() };
        res = { opId: op.opId, status, note, seq: ins.insertId };
        changed = { seq: ins.insertId, note };
      }
      await c.query('INSERT INTO applied_ops (op_id, device_id, response, created_at) VALUES (?, ?, ?, ?)', [
        op.opId,
        deviceId,
        JSON.stringify(res),
        new Date(),
      ]);
      return res;
    });
    if (changed) {
      const ch = changed as { seq: number; note: Note };
      this.deps.onChange(ch.seq, ch.note);
    }
    return result;
  }

  private async addHistory(
    c: PoolConnection,
    date: string,
    version: number,
    content: string,
    color: string | null,
    reason: HistoryReason,
    deviceId: number | null,
    now: Date,
  ) {
    await c.query(
      'INSERT INTO note_history (date, version, content, color, reason, device_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [date, version, content, color, reason, deviceId, now],
    );
    // 날짜별로 최근 N개만 남긴다 (인덱스 (date, id) 사용)
    await c.query(
      `DELETE FROM note_history WHERE date = ? AND id < (
         SELECT id FROM (SELECT id FROM note_history WHERE date = ? ORDER BY id DESC LIMIT 1 OFFSET ?) t)`,
      [date, date, this.deps.historyKeep - 1],
    );
  }

  async pull(since: number, limit = 1000): Promise<PullResponse> {
    const pool = this.deps.pool;
    const [[m]] = await pool.query<RowDataPacket[]>('SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM changes');
    const maxSeq = Number(m.maxSeq);
    if (since > maxSeq) return { notes: [], lastSeq: maxSeq, more: false, reset: true };
    const [rows] = await pool.query<(NoteRow & { seq: number })[]>(
      `SELECT n.*, x.seq FROM (
         SELECT date, MAX(seq) AS seq FROM changes WHERE seq > ? AND seq <= ? GROUP BY date
       ) x JOIN notes n ON n.date = x.date
       ORDER BY x.seq LIMIT ?`,
      [since, maxSeq, limit + 1],
    );
    const more = rows.length > limit;
    const page = more ? rows.slice(0, limit) : rows;
    return {
      notes: page.map((r) => ({ ...rowToNote(r), seq: Number(r.seq) })),
      lastSeq: more ? Number(page[page.length - 1].seq) : maxSeq,
      more,
    };
  }

  async lastSeq(): Promise<number> {
    const [[m]] = await this.deps.pool.query<RowDataPacket[]>('SELECT COALESCE(MAX(seq), 0) AS s FROM changes');
    return Number(m.s);
  }

  async history(date: string) {
    const [rows] = await this.deps.pool.query<RowDataPacket[]>(
      `SELECT h.id, h.version, h.content, h.color, h.reason, h.created_at, d.name AS device
       FROM note_history h LEFT JOIN devices d ON d.id = h.device_id
       WHERE h.date = ? ORDER BY h.id DESC`,
      [date],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      version: r.version,
      content: r.content,
      color: r.color,
      reason: r.reason,
      createdAt: (r.created_at as Date).toISOString(),
      device: r.device ?? null,
    }));
  }

  async getNote(date: string): Promise<Note | null> {
    const [rows] = await this.deps.pool.query<NoteRow[]>('SELECT * FROM notes WHERE date = ?', [date]);
    return rows.length ? rowToNote(rows[0]) : null;
  }

  async allNotes(): Promise<Note[]> {
    const [rows] = await this.deps.pool.query<NoteRow[]>(
      "SELECT * FROM notes WHERE content <> '' OR color IS NOT NULL ORDER BY date",
    );
    return rows.map(rowToNote);
  }

  /** 오래된 opId 기록 정리 (90일) */
  async cleanup() {
    await this.deps.pool.query('DELETE FROM applied_ops WHERE created_at < NOW(3) - INTERVAL 90 DAY');
  }
}
