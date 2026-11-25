import { describe, expect, it } from 'vitest';
import { readLaunchParams, widgetIntentUrl } from '../src/launch';

describe('위젯이 여는 주소 (F19)', () => {
  it('날짜와 연결 challenge 를 읽는다', () => {
    const c = 'a'.repeat(43);
    expect(readLaunchParams(`?date=2026-11-25&widget-link=${c}`)).toEqual({ date: '2026-11-25', widgetLink: c });
  });

  it('형식이 틀린 값은 무시한다', () => {
    expect(readLaunchParams('?date=2026-02-30&widget-link=short')).toEqual({ date: null, widgetLink: null });
    expect(readLaunchParams('')).toEqual({ date: null, widgetLink: null });
  });

  it('연결 코드는 우리 앱 패키지로만 보낸다', () => {
    const u = widgetIntentUrl('ab-c_d');
    expect(u).toBe('intent://widget-link?code=ab-c_d#Intent;scheme=batangcalendar;package=io.github.toddla23.batangcalendar;end');
  });
});
