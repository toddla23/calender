/**
 * 날짜 유틸. 'YYYY-MM-DD' 순수 문자열만 다룬다.
 * 로컬 타임존 변환이 끼면 자정 근처에 하루가 밀리므로, 계산이 필요한 곳은 전부 UTC 기준(Date.UTC)으로만 수행하고
 * 문자열로 되돌릴 때도 getUTC* 만 쓴다. "오늘"만 예외적으로 기기의 로컬 달력 날짜(getFullYear 등)를 사용한다.
 */

export const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** month: 1~12 */
export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

export function toDateString(y: number, m: number, d: number): string {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export interface YMD {
  y: number;
  m: number;
  d: number;
}

export function parseDateString(s: string): YMD | null {
  const mt = DATE_RE.exec(s);
  if (!mt) return null;
  const y = Number(mt[1]);
  const m = Number(mt[2]);
  const d = Number(mt[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function isValidDateString(s: string): boolean {
  return parseDateString(s) !== null;
}

function mustParse(s: string): YMD {
  const p = parseDateString(s);
  if (!p) throw new Error(`잘못된 날짜 형식입니다: ${s}`);
  return p;
}

/** 요일 (0=일 ~ 6=토). 타임존 무관 */
export function dayOfWeek(s: string): number {
  const { y, m, d } = mustParse(s);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(s: string, n: number): string {
  const { y, m, d } = mustParse(s);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return toDateString(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 기기의 로컬 달력 기준 오늘. toISOString()(UTC)을 쓰면 자정 근처에 하루가 밀리므로 쓰지 않는다 */
export function todayString(now: Date = new Date()): string {
  return toDateString(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export interface YearMonth {
  y: number;
  /** 1~12 */
  m: number;
}

export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const idx = ym.y * 12 + (ym.m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

export function monthOf(dateStr: string): YearMonth {
  const { y, m } = mustParse(dateStr);
  return { y, m };
}

export function monthRange(ym: YearMonth): { from: string; to: string } {
  return { from: toDateString(ym.y, ym.m, 1), to: toDateString(ym.y, ym.m, daysInMonth(ym.y, ym.m)) };
}

export interface GridCell {
  date: string;
  inMonth: boolean;
  /** 0=일 ~ 6=토 */
  weekday: number;
}

/** 일요일 시작 월간 그리드. 항상 5~6주(첫 날 앞과 마지막 날 뒤를 이웃 달 날짜로 채움) */
export function buildMonthGrid(ym: YearMonth): GridCell[][] {
  const first = toDateString(ym.y, ym.m, 1);
  const lead = dayOfWeek(first);
  const total = daysInMonth(ym.y, ym.m);
  const weeks = Math.ceil((lead + total) / 7);
  const start = addDays(first, -lead);
  const rows: GridCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const row: GridCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, w * 7 + i);
      row.push({ date, inMonth: date.slice(0, 7) === first.slice(0, 7), weekday: i });
    }
    rows.push(row);
  }
  return rows;
}

/** 그리드가 덮는 전체 날짜 범위 (이웃 달 날짜 포함) */
export function gridRange(ym: YearMonth): { from: string; to: string } {
  const g = buildMonthGrid(ym);
  return { from: g[0][0].date, to: g[g.length - 1][6].date };
}

/** 그리드가 걸치는 연도 목록 (공휴일 조회용: 12월/1월 경계) */
export function yearsInGrid(ym: YearMonth): number[] {
  const { from, to } = gridRange(ym);
  const a = mustParse(from).y;
  const b = mustParse(to).y;
  return a === b ? [a] : [a, b];
}

/** 예: "2026년 10월 7일 (수)" */
export function formatKoreanDate(s: string): string {
  const { y, m, d } = mustParse(s);
  return `${y}년 ${m}월 ${d}일 (${WEEKDAYS_KO[dayOfWeek(s)]})`;
}

export function formatKoreanMonth(ym: YearMonth): string {
  return `${ym.y}년 ${ym.m}월`;
}

/** n개월 이동. 도착 달에 같은 일자가 없으면 말일로 보정 (1/31 + 1달 = 2/28 or 2/29) */
export function addMonths(s: string, n: number): string {
  const { y, m, d } = mustParse(s);
  const t = shiftMonth({ y, m }, n);
  return toDateString(t.y, t.m, Math.min(d, daysInMonth(t.y, t.m)));
}
