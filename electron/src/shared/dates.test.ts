import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  buildMonthGrid,
  dayOfWeek,
  daysInMonth,
  formatYmd,
  isLeapYear,
  isValidYmd,
  parseYmd,
  todayYmd,
  yearsInGrid,
} from './dates';

describe('윤년/월 길이', () => {
  it('윤년 판정', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
  });
  it('2월/30일/31일 달', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('검증/파싱', () => {
  it('유효성', () => {
    expect(isValidYmd('2024-02-29')).toBe(true);
    expect(isValidYmd('2026-02-29')).toBe(false);
    expect(isValidYmd('2026-13-01')).toBe(false);
    expect(isValidYmd('2026-1-1')).toBe(false);
  });
  it('왕복', () => {
    expect(parseYmd('2026-03-05')).toEqual({ y: 2026, m: 3, d: 5 });
    expect(formatYmd(2026, 3, 5)).toBe('2026-03-05');
    expect(() => parseYmd('2026-02-30')).toThrow();
  });
});

describe('요일', () => {
  it('알려진 날짜', () => {
    expect(dayOfWeek('1970-01-01')).toBe(4); // 목
    expect(dayOfWeek('2000-01-01')).toBe(6); // 토
    expect(dayOfWeek('2024-02-29')).toBe(4); // 목
    expect(dayOfWeek('2026-08-27')).toBe(4); // 목
    expect(dayOfWeek('2026-01-01')).toBe(4); // 목
    expect(dayOfWeek('1969-12-31')).toBe(3); // 에폭 이전
  });
});

describe('addDays (월/연/윤년 경계)', () => {
  it('월 경계', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-04-30', 1)).toBe('2026-05-01');
  });
  it('연 경계', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });
  it('윤년', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2024-01-01', 366)).toBe('2025-01-01');
  });
  it('큰 이동도 일관', () => {
    expect(addDays('2026-01-01', 365)).toBe('2027-01-01');
    expect(addDays(addDays('2026-05-05', 1000), -1000)).toBe('2026-05-05');
  });
});

describe('addMonths', () => {
  it('연도 넘김', () => {
    expect(addMonths({ y: 2026, m: 12 }, 1)).toEqual({ y: 2027, m: 1 });
    expect(addMonths({ y: 2026, m: 1 }, -1)).toEqual({ y: 2025, m: 12 });
    expect(addMonths({ y: 2026, m: 6 }, -18)).toEqual({ y: 2024, m: 12 });
    expect(addMonths({ y: 2026, m: 6 }, 0)).toEqual({ y: 2026, m: 6 });
  });
});

describe('월간 그리드 (일요일 시작, 42칸)', () => {
  it('2026년 8월: 1일은 토요일 → 앞에 6칸', () => {
    const g = buildMonthGrid(2026, 8);
    expect(g).toHaveLength(42);
    expect(g[0].date).toBe('2026-07-26');
    expect(g[6].date).toBe('2026-08-01');
    expect(g[6].weekday).toBe(6);
    expect(g[0].inMonth).toBe(false);
    expect(g.filter((c) => c.inMonth)).toHaveLength(31);
    expect(g[41].date).toBe('2026-09-05');
  });
  it('일요일에 시작하는 달(2026-02)은 앞 패딩 없음', () => {
    const g = buildMonthGrid(2026, 2);
    expect(g[0].date).toBe('2026-02-01');
    expect(g[0].weekday).toBe(0);
    expect(g.filter((c) => c.inMonth)).toHaveLength(28);
  });
  it('윤년 2월', () => {
    const g = buildMonthGrid(2024, 2);
    expect(g.filter((c) => c.inMonth)).toHaveLength(29);
    expect(g.some((c) => c.date === '2024-02-29' && c.inMonth)).toBe(true);
  });
  it('연말/연초 그리드는 두 해에 걸친다', () => {
    const g = buildMonthGrid(2026, 12);
    expect(yearsInGrid(g)).toEqual([2026, 2027]);
    const jan = buildMonthGrid(2026, 1);
    expect(yearsInGrid(jan)).toEqual([2025, 2026]);
  });
  it('연속 날짜이며 weekday가 열과 일치', () => {
    const g = buildMonthGrid(2025, 5);
    g.forEach((c, i) => {
      expect(c.weekday).toBe(i % 7);
      expect(dayOfWeek(c.date)).toBe(c.weekday);
      if (i > 0) expect(addDays(g[i - 1].date, 1)).toBe(c.date);
    });
  });
});

describe('todayYmd (자정 근처, 로컬 날짜)', () => {
  it('23:59:59와 00:00:00은 서로 다른 날짜', () => {
    expect(todayYmd(new Date(2026, 7, 27, 23, 59, 59))).toBe('2026-08-27');
    expect(todayYmd(new Date(2026, 7, 28, 0, 0, 0))).toBe('2026-08-28');
  });
  it('월말 자정 직후/직전', () => {
    expect(todayYmd(new Date(2026, 0, 31, 23, 59, 59, 999))).toBe('2026-01-31');
    expect(todayYmd(new Date(2026, 1, 1, 0, 0, 0, 0))).toBe('2026-02-01');
    expect(todayYmd(new Date(2024, 1, 29, 23, 30))).toBe('2024-02-29');
  });
  it('UTC 변환(toISOString)을 쓰면 틀어지는 경우에도 로컬 날짜를 돌려준다', () => {
    // 로컬 시간 00:30 → UTC로는 전날일 수 있는 타임존(KST 등)에서 toISOString은 하루 밀린다
    const d = new Date(2026, 7, 28, 0, 30);
    expect(todayYmd(d)).toBe('2026-08-28');
  });
});
