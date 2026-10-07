/**
 * Windows "항상 맨 아래" 배치.
 * alwaysOnTop을 쓰지 않고, 창이 포커스를 잃을 때마다 user32.SetWindowPos(HWND_BOTTOM)로 z-order 최하단으로 내린다.
 * koffi 로드에 실패해도(비-Windows 개발 환경 등) 앱은 죽지 않고 경고만 남긴다.
 */

const HWND_BOTTOM = 1n;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const GW_HWNDNEXT = 2;
const GW_HWNDPREV = 3;

interface User32 {
  SetWindowPos(hwnd: bigint, after: bigint, x: number, y: number, cx: number, cy: number, flags: number): boolean;
  GetWindow(hwnd: bigint, cmd: number): bigint | number;
  GetClassNameW(hwnd: bigint, buf: Buffer, max: number): number;
}

export interface ZOrderInfo {
  /** 이 창 바로 아래(다음) 창이 없으면 true = 최하단 */
  isBottom: boolean;
  /** 이 창 바로 위 창이 없으면 true = 최상단 */
  isTop: boolean;
  nextClass: string | null;
}

export interface ZOrderController {
  available: boolean;
  lowerToBottom(handle: Buffer): boolean;
  inspect(handle: Buffer): ZOrderInfo | null;
}

/** BrowserWindow.getNativeWindowHandle() 버퍼 → HWND(BigInt) */
export function readHwnd(handle: Buffer): bigint {
  return handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));
}

export function createZOrderController(log: { info(...a: unknown[]): void; warn(...a: unknown[]): void }): ZOrderController {
  const none: ZOrderController = { available: false, lowerToBottom: () => false, inspect: () => null };
  if (process.platform !== 'win32') {
    log.warn('[z-order] Windows가 아니므로 "항상 맨 아래" 기능을 건너뜁니다');
    return none;
  }

  let u: User32;
  try {
    // 지연 로드: 로드 실패가 앱 전체 실패로 번지지 않도록 try 안에서 require
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi');
    const lib = koffi.load('user32.dll');
    const SetWindowPos = lib.func(
      'bool __stdcall SetWindowPos(intptr_t hWnd, intptr_t hWndInsertAfter, int X, int Y, int cx, int cy, uint32_t uFlags)',
    );
    const GetWindow = lib.func('intptr_t __stdcall GetWindow(intptr_t hWnd, uint32_t uCmd)');
    const GetClassNameW = lib.func('int __stdcall GetClassNameW(intptr_t hWnd, _Out_ uint8_t *buf, int nMaxCount)');
    u = { SetWindowPos, GetWindow, GetClassNameW };
    log.info('[z-order] koffi/user32.dll 로드 성공');
  } catch (e) {
    log.warn('[z-order] koffi 로드 실패 — "항상 맨 아래"가 동작하지 않습니다:', (e as Error).message);
    return none;
  }

  const toBig = (v: bigint | number) => BigInt(v);

  return {
    available: true,
    lowerToBottom(handle) {
      try {
        const ok = u.SetWindowPos(readHwnd(handle), HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        if (!ok) log.warn('[z-order] SetWindowPos가 false를 반환했습니다');
        return !!ok;
      } catch (e) {
        log.warn('[z-order] SetWindowPos 호출 실패:', (e as Error).message);
        return false;
      }
    },
    inspect(handle) {
      try {
        const hwnd = readHwnd(handle);
        const next = toBig(u.GetWindow(hwnd, GW_HWNDNEXT));
        const prev = toBig(u.GetWindow(hwnd, GW_HWNDPREV));
        let nextClass: string | null = null;
        if (next !== 0n) {
          const buf = Buffer.alloc(512);
          const n = u.GetClassNameW(next, buf, 256);
          nextClass = buf.toString('utf16le', 0, Math.max(0, n) * 2);
        }
        return { isBottom: next === 0n, isTop: prev === 0n, nextClass };
      } catch (e) {
        log.warn('[z-order] 조회 실패:', (e as Error).message);
        return null;
      }
    },
  };
}
