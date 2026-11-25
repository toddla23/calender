import { isValidDate } from '../../server/src/protocol';

/** Android 위젯(F19)이 앱을 열 때 붙이는 주소 매개변수 */
export interface LaunchParams {
  /** 위젯에서 탭한 날짜 → 그 날짜 편집 */
  date: string | null;
  /** 위젯 연결 요청 (위젯이 만든 PKCE challenge, D-025) */
  widgetLink: string | null;
}

export function readLaunchParams(search: string): LaunchParams {
  const p = new URLSearchParams(search);
  const date = p.get('date');
  const link = p.get('widget-link');
  return {
    date: date && isValidDate(date) ? date : null,
    widgetLink: link && /^[A-Za-z0-9_-]{43}$/.test(link) ? link : null,
  };
}

export const ANDROID_PACKAGE = 'io.github.toddla23.batangcalendar';

/** 연결 코드를 우리 Android 앱에만 넘기는 주소. package 를 지정해 다른 앱이 받지 못한다 */
export function widgetIntentUrl(code: string): string {
  return `intent://widget-link?code=${encodeURIComponent(code)}#Intent;scheme=batangcalendar;package=${ANDROID_PACKAGE};end`;
}

const PENDING_KEY = 'deskcal-widget-link';

/** 로그인하느라 페이지를 떠나도 연결 요청을 잊지 않게 이 탭에 10분 동안 둔다 */
export const pendingWidgetLink = {
  save(challenge: string) {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ challenge, at: Date.now() }));
  },
  take(): string | null {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    try {
      const v = JSON.parse(raw ?? 'null') as { challenge: string; at: number } | null;
      return v && Date.now() - v.at < 10 * 60_000 ? v.challenge : null;
    } catch {
      return null;
    }
  },
};
