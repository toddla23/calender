import fs from 'node:fs';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { Holiday } from './protocol.js';

/** data/holidays-kr.json (내장) + DB 의 임시공휴일 */
export class HolidayService {
  private builtin: Holiday[];
  constructor(
    private pool: Pool,
    file: string,
  ) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { years: Record<string, Record<string, string>> };
    this.builtin = Object.values(raw.years).flatMap((y) => Object.entries(y).map(([date, name]) => ({ date, name })));
  }

  async list(): Promise<Holiday[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT date, name FROM custom_holidays ORDER BY date');
    return [...this.builtin, ...rows.map((r) => ({ date: r.date as string, name: r.name as string, custom: true }))];
  }

  async customList(): Promise<Holiday[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT date, name FROM custom_holidays ORDER BY date');
    return rows.map((r) => ({ date: r.date, name: r.name, custom: true }));
  }

  async addCustom(date: string, name: string) {
    await this.pool.query(
      'INSERT INTO custom_holidays (date, name, created_at) VALUES (?, ?, NOW(3)) ON DUPLICATE KEY UPDATE name = VALUES(name)',
      [date, name],
    );
  }

  async removeCustom(date: string): Promise<boolean> {
    const [r] = await this.pool.query<any>('DELETE FROM custom_holidays WHERE date = ?', [date]);
    return r.affectedRows > 0;
  }
}
