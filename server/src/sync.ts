import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
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
  /** 커밋된 변경을 그 사용자의 기기들에 실시간으로 알린다. */
  onChange: (userId: number, seq: number, note: Note) => void;
}

export interface ApplyOptions {
  /** 이력 사유를 강제로 정한다 (가져오기 등) */
  reason?: HistoryReason;
  /** 저장 용량 한도(바이트, 메모·이력 각각). null 이면 제한 없음(관리자) */
  quota?: number | null;
}

/** 저장 용량 계산: 내용 바이트 + 행마다 100 (빈 메모를 아주 많이 만드는 것도 막는다) */
export const ROW_OVERHEAD = 100;
const cost = (content: string) => Buffer.byteLength(content, 'utf8') + ROW_OVERHEAD;
const MB = 1024 * 1024;

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
   * 사용자 userId 의 달력에 op 하나를 적용한다.
   * - 같은 opId 가 이미 처리됐으면 저장된 응답을 그대로 돌려준다 (status=duplicate)
   * - baseVersion 이 현재 version 과 다르고 내용도 다르면 두 내용을 합치고 충돌 표시
   * 모든 쓰기는 자기 users 행을 잠가 사용자별로 직렬화하므로 변경 번호(seq)는 커밋 순서와 일치한다 (D-016).
   */
  async applyOp(userId: number, op: Op, deviceId: number | null, opts: ApplyOptions = {}): Promise<OpResult> {
    const err = validateOp(op);
    if (err) return { opId: (op as Op)?.opId ?? '', status: 'rejected', error: err };
    const quota = opts.quota ?? null;

    let changed: { seq: number; note: Note } | null = null;
    const result = await tx(this.deps.pool, async (c) => {
      const [urows] = await c.query<RowDataPacket[]>(
        'SELECT last_seq, note_bytes, history_bytes FROM users WHERE id = ? FOR UPDATE',
        [userId],
      );
      if (!urows.length) return { opId: op.opId, status: 'rejected', error: '사용자가 없습니다' } as OpResult;
      const u = urows[0];

      const [dup] = await c.query<RowDataPacket[]>('SELECT user_id, response FROM applied_ops WHERE op_id = ?', [op.opId]);
      if (dup.length) {
        if (Number(dup[0].user_id) !== userId) return { opId: op.opId, status: 'rejected', error: 'opId 충돌' } as OpResult;
        const prev = JSON.parse(dup[0].response) as OpResult;
        return { ...prev, status: 'duplicate' } as OpResult;
      }

      const [rows] = await c.query<NoteRow[]>('SELECT * FROM notes WHERE user_id = ? AND date = ?', [userId, op.date]);
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
        // 용량: 메모가 커지는 수정만 막는다. 줄이거나 지우는 수정은 한도를 넘었어도 받는다.
        const noteBytes = Number(u.note_bytes) + cost(content) - (rows.length ? cost(cur.content) : 0);
        if (quota !== null && noteBytes > Number(u.note_bytes) && noteBytes > quota) {
          return {
            opId: op.opId,
            status: 'rejected',
            error: `저장 공간(${Math.round(quota / MB)}MB)이 가득 찼습니다. 필요 없는 메모를 지운 뒤 다시 저장하세요.`,
          } as OpResult;
        }
        const version = cur.version + 1;
        const now = new Date();
        await c.query(
          `INSERT INTO notes (user_id, date, content, color, version, conflict, updated_at, device_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE content = VALUES(content), color = VALUES(color), version = VALUES(version),
             conflict = VALUES(conflict), updated_at = VALUES(updated_at), device_id = VALUES(device_id)`,
          [userId, op.date, content, color, version, conflict ? 1 : 0, now, deviceId],
        );
        let historyBytes = Number(u.history_bytes);
        if (clientConflictContent !== null) {
          historyBytes += await this.addHistory(c, userId, op.date, op.baseVersion, clientConflictContent, color, 'conflict_client', deviceId, now);
        }
        const reason: HistoryReason =
          opts.reason ?? (status === 'merged' ? 'merged' : op.kind === 'restore' ? 'restore' : 'edit');
        historyBytes += await this.addHistory(c, userId, op.date, version, content, color, reason, deviceId, now);
        // 이력이 한도를 넘으면 그 사용자의 가장 오래된 이력부터 지운다
        if (quota !== null && historyBytes > quota) historyBytes -= await this.trimHistory(c, userId, historyBytes - quota);

        const seq = Number(u.last_seq) + 1;
        await c.query('INSERT INTO changes (user_id, seq, date, version, device_id, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
          userId,
          seq,
          op.date,
          version,
          deviceId,
          now,
        ]);
        // since 조회에는 날짜별 마지막 변경 번호만 있으면 된다
        await c.query('DELETE FROM changes WHERE user_id = ? AND date = ? AND seq < ?', [userId, op.date, seq]);
        await c.query('UPDATE users SET last_seq = ?, note_bytes = ?, history_bytes = ? WHERE id = ?', [
          seq,
          Math.max(0, noteBytes),
          Math.max(0, historyBytes),
          userId,
        ]);
        const note: Note = { date: op.date, content, color, version, conflict, updatedAt: now.toISOString() };
        res = { opId: op.opId, status, note, seq };
        changed = { seq, note };
      }
      await c.query('INSERT INTO applied_ops (op_id, user_id, device_id, response, created_at) VALUES (?, ?, ?, ?, ?)', [
        op.opId,
        userId,
        deviceId,
        JSON.stringify(res),
        new Date(),
      ]);
      return res;
    });
    if (changed) {
      const ch = changed as { seq: number; note: Note };
      this.deps.onChange(userId, ch.seq, ch.note);
    }
    return result;
  }

  /** 이력 한 줄을 넣고 그 날짜의 최근 N개만 남긴다. 늘어난 용량(바이트)을 돌려준다. */
  private async addHistory(
    c: PoolConnection,
    userId: number,
    date: string,
    version: number,
    content: string,
    color: string | null,
    reason: HistoryReason,
    deviceId: number | null,
    now: Date,
  ): Promise<number> {
    await c.query(
      'INSERT INTO note_history (user_id, date, version, content, color, reason, device_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, date, version, content, color, reason, deviceId, now],
    );
    let delta = cost(content);
    const [cut] = await c.query<RowDataPacket[]>(
      'SELECT id FROM note_history WHERE user_id = ? AND date = ? ORDER BY id DESC LIMIT 1 OFFSET ?',
      [userId, date, this.deps.historyKeep - 1],
    );
    if (cut.length) {
      const where = 'user_id = ? AND date = ? AND id < ?';
      const args = [userId, date, cut[0].id];
      const [[s]] = await c.query<RowDataPacket[]>(
        `SELECT COALESCE(SUM(LENGTH(content) + ${ROW_OVERHEAD}), 0) AS b FROM note_history WHERE ${where}`,
        args,
      );
      await c.query(`DELETE FROM note_history WHERE ${where}`, args);
      delta -= Number(s.b);
    }
    return delta;
  }

  /** 사용자의 가장 오래된 이력부터 need 바이트 이상 지운다. 지운 바이트를 돌려준다. */
  private async trimHistory(c: PoolConnection, userId: number, need: number): Promise<number> {
    let freed = 0;
    while (freed < need) {
      const [rows] = await c.query<RowDataPacket[]>(
        `SELECT id, LENGTH(content) + ${ROW_OVERHEAD} AS b FROM note_history WHERE user_id = ? ORDER BY id LIMIT 100`,
        [userId],
      );
      if (!rows.length) break;
      let lastId = 0;
      for (const r of rows) {
        freed += Number(r.b);
        lastId = Number(r.id);
        if (freed >= need) break;
      }
      await c.query('DELETE FROM note_history WHERE user_id = ? AND id <= ?', [userId, lastId]);
    }
    return freed;
  }

  async pull(userId: number, since: number, limit = 1000): Promise<PullResponse> {
    const maxSeq = await this.lastSeq(userId);
    if (since > maxSeq) return { notes: [], lastSeq: maxSeq, more: false, reset: true };
    const [rows] = await this.deps.pool.query<(NoteRow & { seq: number })[]>(
      `SELECT n.*, x.seq FROM (
         SELECT date, MAX(seq) AS seq FROM changes WHERE user_id = ? AND seq > ? AND seq <= ? GROUP BY date
       ) x JOIN notes n ON n.user_id = ? AND n.date = x.date
       ORDER BY x.seq LIMIT ?`,
      [userId, since, maxSeq, userId, limit + 1],
    );
    const more = rows.length > limit;
    const page = more ? rows.slice(0, limit) : rows;
    return {
      notes: page.map((r) => ({ ...rowToNote(r), seq: Number(r.seq) })),
      lastSeq: more ? Number(page[page.length - 1].seq) : maxSeq,
      more,
    };
  }

  /** 커밋된 마지막 변경 번호. users.last_seq 는 변경과 같은 트랜잭션에서 오르므로 이 값 이하는 모두 커밋돼 있다. */
  async lastSeq(userId: number): Promise<number> {
    const [rows] = await this.deps.pool.query<RowDataPacket[]>('SELECT last_seq FROM users WHERE id = ?', [userId]);
    return Number(rows[0]?.last_seq ?? 0);
  }

  async history(userId: number, date: string) {
    const [rows] = await this.deps.pool.query<RowDataPacket[]>(
      `SELECT h.id, h.version, h.content, h.color, h.reason, h.created_at, d.name AS device
       FROM note_history h LEFT JOIN devices d ON d.id = h.device_id
       WHERE h.user_id = ? AND h.date = ? ORDER BY h.id DESC`,
      [userId, date],
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

  async getNote(userId: number, date: string): Promise<Note | null> {
    const [rows] = await this.deps.pool.query<NoteRow[]>('SELECT * FROM notes WHERE user_id = ? AND date = ?', [userId, date]);
    return rows.length ? rowToNote(rows[0]) : null;
  }

  async allNotes(userId: number): Promise<Note[]> {
    const [rows] = await this.deps.pool.query<NoteRow[]>(
      "SELECT * FROM notes WHERE user_id = ? AND (content <> '' OR color IS NOT NULL) ORDER BY date",
      [userId],
    );
    return rows.map(rowToNote);
  }

  /** 오래된 opId 기록 정리 (90일) */
  async cleanup() {
    await this.deps.pool.query('DELETE FROM applied_ops WHERE created_at < NOW(3) - INTERVAL 90 DAY');
  }
}
