import type { Note, SyncStatus, Holiday } from '@calendar/sync-core';

export type { Note, SyncStatus, Holiday };

export interface WidgetBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Settings {
  /** 창 투명도 0.3~1 */
  opacity: number;
  /** 기본 글자 크기(px) 11~18 */
  fontSize: number;
  /** true면 위치/크기 이동 불가 */
  locked: boolean;
  autoStart: boolean;
  /** 사용자가 지정한 서버 주소. null이면 환경변수/기본값 */
  serverUrl: string | null;
  bounds: WidgetBounds | null;
}

export const DEFAULT_SETTINGS: Settings = {
  opacity: 0.95,
  fontSize: 13,
  locked: false,
  autoStart: false,
  serverUrl: null,
  bounds: null,
};

export interface AppSnapshot {
  auth: { loggedIn: boolean; email: string | null };
  status: SyncStatus;
  /** 서버에 아직 반영되지 않은 로컬 변경 수 */
  unsynced: number;
  /** 최초 Pull 진행 중 수신 건수 (진행 중 아니면 null) */
  pullReceived: number | null;
  /** 서버 시계 이상 등 경고 문구 */
  warning: string | null;
  online: boolean | null;
  settings: Settings;
  serverUrl: string;
  /** 환경변수 CALENDAR_SERVER_URL로 지정되어 있는지 */
  serverUrlFromEnv: boolean;
  login: { googleConfigured: boolean; devLogin: boolean };
}

export interface LoginResult {
  ok: boolean;
  error?: string;
}

export const NOTE_COLORS = ['#4f8ef7', '#34c38f', '#f1b44c', '#f46a6a', '#a77bf3', '#50a5f1', '#74788d'] as const;
