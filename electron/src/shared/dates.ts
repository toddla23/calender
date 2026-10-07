/**
 * 날짜 유틸. 'YYYY-MM-DD' 순수 문자열만 다루며 Date 객체를 거치지 않는다
 * (타임존/DST로 자정 근처 날짜가 하루 밀리는 버그 방지).
 * 달(month)은 항상 1~12.
 */
export type Ymd = string;

export interface YearMonth {
  y: number;
  m: number;
}

export interface GridCell {
  date: Ymd;
  y: number;
  m: number;
  d: number;
  /** 0=일 ... 6=토 */
  weekday: number;
  inMonth: boolean;
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

export function formatYmd(y: number, m: number, d: number): Ymd {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function isValidYmd(s: string): boolean {
  const m = YMD_RE.exec(s);
  if (!m) return false;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function parseYmd(s: Ymd): { y: number; m: number; d: number } {
  const m = YMD_RE.exec(s);
  if (!m || !isValidYmd(s)) throw new Error(`잘못된 날짜: ${s}`);
  return { y: +m[1], m: +m[2], d: +m[3] };
}

/** 1970-01-01 기준 일 수 (Howard Hinnant의 days_from_civil) */
function toEpochDay(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function fromEpochDay(z0: number): { y: number; m: number; d: number } {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return { y, m, d };
}

/** 요일 (0=일 ... 6=토) */
export function dayOfWeek(s: Ymd): number {
  const { y, m, d } = parseYmd(s);
  return (((toEpochDay(y, m, d) + 4) % 7) + 7) % 7;
}

export function addDays(s: Ymd, n: number): Ymd {
  const { y, m, d } = parseYmd(s);
  const r = fromEpochDay(toEpochDay(y, m, d) + n);
  return formatYmd(r.y, r.m, r.d);
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const idx = ym.y * 12 + (ym.m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (((idx % 12) + 12) % 12) + 1 };
}

/** 사용자의 "오늘"은 기기 로컬 날짜. Date의 로컬 getter만 사용 (toISOString/UTC 사용 금지) */
export function todayYmd(now: Date = new Date()): Ymd {
  return formatYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** 일요일 시작 6주(42칸) 월간 그리드 */
export function buildMonthGrid(y: number, m: number): GridCell[] {
  const first = formatYmd(y, m, 1);
  const start = addDays(first, -dayOfWeek(first));
  const cells: GridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i);
    const p = parseYmd(date);
    cells.push({ date, ...p, weekday: i % 7, inMonth: p.y === y && p.m === m });
  }
  return cells;
}

/** 그리드가 걸치는 서로 다른 연도 목록 (공휴일 조회용) */
export function yearsInGrid(cells: GridCell[]): number[] {
  return [...new Set(cells.map((c) => c.y))];
}

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;
