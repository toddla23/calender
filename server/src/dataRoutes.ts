import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { SyncService } from './sync.js';
import type { HolidayService } from './holidays.js';
import type { Hub } from './app.js';
import { COLORS, isValidDate, type ColorKey } from './protocol.js';

export const EXPORT_FORMAT = 'deskcal-export';

/** JSON 전체 내보내기/가져오기 */
export function registerDataRoutes(api: FastifyInstance, deps: { sync: SyncService; holidays: HolidayService; hub: Hub }) {
  api.get('/api/export', async (_req, reply) => {
    const notes = await deps.sync.allNotes();
    const body = {
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      notes: notes.map((n) => ({ date: n.date, content: n.content, color: n.color })),
      customHolidays: (await deps.holidays.customList()).map((h) => ({ date: h.date, name: h.name })),
    };
    const stamp = new Date().toISOString().slice(0, 10);
    reply.header('Content-Disposition', `attachment; filename="deskcal-${stamp}.json"`);
    return body;
  });

  // 파일에 있는 날짜만 덮어쓴다. 덮어쓴 칸도 이력에 남으므로 되돌릴 수 있다.
  api.post('/api/import', { bodyLimit: 10 * 1024 * 1024 }, async (req, reply) => {
    const b = req.body as {
      format?: string;
      notes?: { date: string; content?: string; color?: string | null }[];
      customHolidays?: { date: string; name: string }[];
    };
    if (!b || b.format !== EXPORT_FORMAT || !Array.isArray(b.notes)) {
      return reply.code(400).send({ error: '이 앱에서 내보낸 JSON 파일이 아닙니다' });
    }
    let imported = 0;
    let unchanged = 0;
    const errors: string[] = [];
    for (const n of b.notes) {
      if (!n || !isValidDate(n.date)) {
        errors.push(`잘못된 날짜: ${String(n?.date).slice(0, 20)}`);
        continue;
      }
      const color = n.color && (COLORS as readonly string[]).includes(n.color) ? (n.color as ColorKey) : null;
      const cur = await deps.sync.getNote(n.date);
      const res = await deps.sync.applyOp(
        {
          opId: crypto.randomUUID(),
          date: n.date,
          baseVersion: cur?.version ?? 0,
          content: typeof n.content === 'string' ? n.content : '',
          color,
        },
        req.device!.id,
        'import',
      );
      if (res.status === 'rejected') errors.push(`${n.date}: ${res.error}`);
      else if (res.seq) imported++;
      else unchanged++;
    }
    let holidays = 0;
    for (const h of b.customHolidays ?? []) {
      if (h && isValidDate(h.date) && typeof h.name === 'string' && h.name.trim() && h.name.length <= 100) {
        await deps.holidays.addCustom(h.date, h.name.trim());
        holidays++;
      }
    }
    if (holidays) deps.hub.broadcast({ type: 'holidays' });
    req.log.info({ imported, unchanged, holidays, errors: errors.length }, '가져오기');
    return { imported, unchanged, holidays, errors: errors.slice(0, 50) };
  });
}
