// 서버와 클라이언트(web, desktop)가 함께 쓰는 동기화 프로토콜 정의.
// web 쪽은 이 파일을 직접 import 한다. 런타임 의존성을 두지 말 것.

export const CONFLICT_SEPARATOR = '--- 다른 기기에서 수정 ---';
export const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'] as const;
export type ColorKey = (typeof COLORS)[number];
export const MAX_NOTE_BYTES = 64 * 1024;
export const MAX_OPS_PER_PUSH = 200;

export interface Note {
  date: string; // YYYY-MM-DD
  content: string;
  color: ColorKey | null;
  version: number;
  conflict: boolean;
  updatedAt?: string;
}

export interface Op {
  opId: string; // UUID
  date: string;
  baseVersion: number;
  /** 바뀐 경우에만 보낸다. 없으면 내용은 그대로 둔다. */
  content?: string;
  /** 바뀐 경우에만 보낸다. null 은 색 없음. */
  color?: ColorKey | null;
  /** 충돌 표시를 직접 해제한 경우 */
  resolveConflict?: boolean;
  /** 이력 표시용 */
  kind?: 'edit' | 'restore';
}

export type OpStatus = 'applied' | 'merged' | 'duplicate' | 'rejected';

export interface OpResult {
  opId: string;
  status: OpStatus;
  note?: Note;
  seq?: number | null;
  error?: string;
}

export interface PushResponse {
  results: OpResult[];
}

export interface PullResponse {
  notes: (Note & { seq: number })[];
  lastSeq: number;
  more: boolean;
  /** 클라이언트의 since 가 서버보다 앞서 있음(복원 등) → 전체 재동기화 필요 */
  reset?: boolean;
}

export type ServerEvent =
  | { type: 'hello'; lastSeq: number }
  | { type: 'note'; seq: number; note: Note }
  | { type: 'holidays' };

export interface Holiday {
  date: string;
  name: string;
  custom?: boolean;
}

/** Android 위젯 (F19, D-023) */
export const WIDGET_MAX_DAYS = 62; // GET /api/widget 한 번에 받는 날짜 수 (from~to 포함)
export const WIDGET_PREVIEW_CHARS = 300; // 메모 앞부분 글자 수

export interface WidgetResponse {
  from: string;
  to: string;
  notes: { date: string; text: string; color: ColorKey | null; conflict: boolean }[];
  holidays: Holiday[];
}

export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 충돌 시 두 내용을 합친다. */
export function mergeContents(server: string, mine: string): string {
  return `${server}\n${CONFLICT_SEPARATOR}\n${mine}`;
}
