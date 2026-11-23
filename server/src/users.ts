import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { tx } from './db.js';

export interface User {
  id: number;
  email: string;
}

/** 사용자 (D-015). 처음 Google 로그인할 때 만들고, 계정 삭제 시 데이터와 함께 지운다. */
export class UserStore {
  constructor(private pool: Pool) {}

  /**
   * 마이그레이션 전의 달력(id=1, 이메일 빈 값)을 주인 이메일에 넘겨주고,
   * 이메일로 기존 기기 토큰을 사용자에 연결한다. 서버가 시작할 때마다 부르며, 할 일이 없으면 아무것도 안 한다.
   */
  async adoptLegacy(ownerEmail: string): Promise<void> {
    if (ownerEmail) {
      const [owner] = await this.pool.query<RowDataPacket[]>('SELECT id FROM users WHERE email = ?', [ownerEmail]);
      if (!owner.length) await this.pool.query("UPDATE users SET email = ? WHERE email = ''", [ownerEmail]);
    }
    await this.pool.query(
      'UPDATE devices d JOIN users u ON u.email = d.email SET d.user_id = u.id WHERE d.user_id IS NULL',
    );
  }

  async byEmail(email: string): Promise<User | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT id, email FROM users WHERE email = ?', [email]);
    return rows.length ? { id: rows[0].id, email: rows[0].email } : null;
  }

  /** 있으면 돌려주고, 없으면 만든다. 인원이 maxUsers 에 찼으면 null. */
  async findOrCreate(email: string, maxUsers: number): Promise<User | null> {
    const found = await this.byEmail(email);
    if (found) return found;
    if (Number.isFinite(maxUsers)) {
      const [[c]] = await this.pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM users WHERE email <> ''");
      if (Number(c.n) >= maxUsers) return null;
    }
    await this.pool.query<ResultSetHeader>('INSERT IGNORE INTO users (email, created_at) VALUES (?, NOW(3))', [email]);
    return this.byEmail(email);
  }

  async count(): Promise<number> {
    const [[c]] = await this.pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM users WHERE email <> ''");
    return Number(c.n);
  }

  async usage(userId: number): Promise<{ noteBytes: number; historyBytes: number }> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT note_bytes, history_bytes FROM users WHERE id = ?', [userId]);
    return { noteBytes: Number(rows[0]?.note_bytes ?? 0), historyBytes: Number(rows[0]?.history_bytes ?? 0) };
  }

  /** 계정과 그 사용자의 모든 데이터를 지운다. 백업 파일에는 보관 기간 동안 남는다. */
  async delete(userId: number): Promise<void> {
    await tx(this.pool, async (c) => {
      await c.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
      for (const table of ['notes', 'note_history', 'changes', 'applied_ops', 'devices']) {
        await c.query(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
      }
      await c.query('DELETE FROM users WHERE id = ?', [userId]);
    });
  }
}
