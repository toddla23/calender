import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { SyncService } from './sync.js';
import type { HolidayService } from './holidays.js';
import type { Hub } from './app.js';
import type { Device } from './auth.js';
import { COLORS, isValidDate, type ColorKey } from './protocol.js';

export const EXPORT_FORMAT = 'deskcal-export';

export interface DataDeps {
  sync: SyncService;
  holidays: HolidayService;
  hub: Hub;
  isAdmin: (d?: Device) => boolean;
  quotaFor: (d: Device) => number | null;
  takeOps: (d: Device, n: number) => boolean;
}

/** JSON 전체 내보내기/가져오기. 자기 달력만 대상이다. */
export function registerDataRoutes(api: FastifyInstance, deps: DataDeps) {
  api.get('/api/export', async (req, reply) => {
    const notes = await deps.sync.allNotes(req.device!.userId);
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
    const d = req.device!;
    const b = req.body as {
      format?: string;
      notes?: { date: string; content?: string; color?: string | null }[];
      customHolidays?: { date: string; name: string }[];
    };
    if (!b || b.format !== EXPORT_FORMAT || !Array.isArray(b.notes)) {
      return reply.code(400).send({ error: '이 앱에서 내보낸 JSON 파일이 아닙니다' });
    }
    if (!deps.takeOps(d, b.notes.length)) {
      return reply.code(429).send({ error: `한 번에 가져올 수 있는 칸 수를 넘었습니다. 파일을 나눠서 잠시 뒤에 다시 시도하세요.` });
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
      const cur = await deps.sync.getNote(d.userId, n.date);
      const res = await deps.sync.applyOp(
        d.userId,
        {
          opId: crypto.randomUUID(),
          date: n.date,
          baseVersion: cur?.version ?? 0,
          content: typeof n.content === 'string' ? n.content : '',
          color,
        },
        d.id,
        { reason: 'import', quota: deps.quotaFor(d) },
      );
      if (res.status === 'rejected') errors.push(`${n.date}: ${res.error}`);
      else if (res.seq) imported++;
      else unchanged++;
    }
    // 임시공휴일은 모든 사용자가 함께 보므로 관리자만 가져올 수 있다
    let holidays = 0;
    if (deps.isAdmin(d)) {
      for (const h of b.customHolidays ?? []) {
        if (h && isValidDate(h.date) && typeof h.name === 'string' && h.name.trim() && h.name.length <= 100) {
          await deps.holidays.addCustom(h.date, h.name.trim());
          holidays++;
        }
      }
      if (holidays) deps.hub.broadcast({ type: 'holidays' });
    }
    req.log.info({ imported, unchanged, holidays, errors: errors.length }, '가져오기');
    return { imported, unchanged, holidays, errors: errors.slice(0, 50) };
  });
}
