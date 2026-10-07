import {
  addDays,
  addMonths,
  buildMonthGrid,
  dayOfWeek,
  daysInMonth,
  formatKoreanDate,
  gridRange,
  isLeapYear,
  isValidDateString,
  monthRange,
  parseDateString,
  shiftMonth,
  todayString,
  yearsInGrid,
} from '../src/lib/date';

describe('날짜 유틸', () => {
  test('윤년/월 말일', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2025, 4)).toBe(30);
    expect(daysInMonth(2025, 12)).toBe(31);
  });

  test('문자열 검증', () => {
    expect(parseDateString('2024-02-29')).toEqual({ y: 2024, m: 2, d: 29 });
    expect(isValidDateString('2025-02-29')).toBe(false);
    expect(isValidDateString('2025-13-01')).toBe(false);
    expect(isValidDateString('2025-1-1')).toBe(false);
    expect(isValidDateString('2025-04-31')).toBe(false);
  });

  test('요일은 타임존과 무관', () => {
    expect(dayOfWeek('2026-10-07')).toBe(3); // 수
    expect(dayOfWeek('2024-02-29')).toBe(4); // 목
    expect(dayOfWeek('2023-12-31')).toBe(0); // 일
  });

  test('addDays: 월/연/윤년 경계', () => {
    expect(addDays('2025-01-31', 1)).toBe('2025-02-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28');
  });

  test('addMonths: 말일 보정', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2025-12-15', 1)).toBe('2026-01-15');
    expect(addMonths('2025-01-15', -1)).toBe('2024-12-15');
  });

  test('shiftMonth', () => {
    expect(shiftMonth({ y: 2025, m: 12 }, 1)).toEqual({ y: 2026, m: 1 });
    expect(shiftMonth({ y: 2025, m: 1 }, -1)).toEqual({ y: 2024, m: 12 });
    expect(shiftMonth({ y: 2025, m: 6 }, -18)).toEqual({ y: 2023, m: 12 });
  });

  test('monthRange', () => {
    expect(monthRange({ y: 2024, m: 2 })).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });

  test('월간 그리드: 일요일 시작, 이웃 달 채움', () => {
    // 2026-02: 2/1이 일요일, 28일 → 정확히 4주
    const feb = buildMonthGrid({ y: 2026, m: 2 });
    expect(feb).toHaveLength(4);
    expect(feb[0][0]).toEqual({ date: '2026-02-01', inMonth: true, weekday: 0 });
    expect(feb[3][6].date).toBe('2026-02-28');

    // 2026-10: 10/1이 목요일 → 앞 4칸은 9월
    const oct = buildMonthGrid({ y: 2026, m: 10 });
    expect(oct[0][0].date).toBe('2026-09-27');
    expect(oct[0][0].inMonth).toBe(false);
    expect(oct[0][4]).toEqual({ date: '2026-10-01', inMonth: true, weekday: 4 });
    expect(oct).toHaveLength(5);
    expect(oct.flat().every((c, i) => c.weekday === i % 7)).toBe(true);

    // 6주가 필요한 달: 2025-03 (3/1이 토요일, 31일)
    expect(buildMonthGrid({ y: 2025, m: 3 })).toHaveLength(6);
  });

  test('그리드 범위/연도 경계', () => {
    expect(gridRange({ y: 2026, m: 1 })).toEqual({ from: '2025-12-28', to: '2026-01-31' });
    expect(yearsInGrid({ y: 2026, m: 1 })).toEqual([2025, 2026]);
    expect(yearsInGrid({ y: 2026, m: 6 })).toEqual([2026]);
  });

  test('todayString은 UTC가 아닌 로컬 달력 날짜 (자정 근처 하루 밀림 방지)', () => {
    // 로컬 시각 2026-03-01 00:05 → toISOString()은 UTC에 따라 2/28이 될 수 있지만 로컬 날짜는 3/1
    expect(todayString(new Date(2026, 2, 1, 0, 5, 0))).toBe('2026-03-01');
    // 로컬 시각 2026-03-01 23:59
    expect(todayString(new Date(2026, 2, 1, 23, 59, 59))).toBe('2026-03-01');
    expect(todayString(new Date(2024, 1, 29, 0, 0, 1))).toBe('2024-02-29');
    expect(todayString(new Date(2025, 11, 31, 23, 59, 59))).toBe('2025-12-31');
  });

  test('계산은 프로세스 타임존이 달라도 같은 결과', () => {
    const original = process.env.TZ;
    try {
      for (const tz of ['Asia/Seoul', 'America/Los_Angeles', 'Pacific/Kiritimati', 'UTC']) {
        process.env.TZ = tz;
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
        expect(addDays('2026-03-08', 1)).toBe('2026-03-09'); // 미국 DST 시작일
        expect(dayOfWeek('2026-03-08')).toBe(0);
        expect(buildMonthGrid({ y: 2026, m: 3 })[0][0].date).toBe('2026-03-01');
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  test('한국어 날짜 표기', () => {
    expect(formatKoreanDate('2026-10-07')).toBe('2026년 10월 7일 (수)');
  });
});
