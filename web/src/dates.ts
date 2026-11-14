const p2 = (n: number) => String(n).padStart(2, '0');

export const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const todayStr = () => ymd(new Date());

/** 일요일 시작 6주(42칸) 날짜 목록 */
export function monthCells(year: number, month0: number): string[] {
  const first = new Date(year, month0, 1);
  const start = new Date(year, month0, 1 - first.getDay());
  const out: string[] = [];
  for (let i = 0; i < 42; i++) out.push(ymd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
  return out;
}

export function msUntilMidnight(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return next.getTime() - now.getTime();
}

export function formatDateKo(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = '일월화수목금토'[new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 (${dow})`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
