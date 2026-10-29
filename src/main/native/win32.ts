import { nodeRequire } from '../engines/req';
import { logger } from '../services/log';

const log = logger('win32');

/** Everything that touches Win32 sits behind this interface so it can be mocked (AGENTS.md). */
export interface Win32 {
  readonly available: boolean;
  /** Class name of the top-level window under a physical-pixel point, or null if unknown. */
  windowClassAt(x: number, y: number): string | null;
  isKeyDown(virtualKey: number): boolean;
}

export const VK = { SHIFT: 0x10, CONTROL: 0x11, MENU: 0x12 } as const;
const GA_ROOT = 2;

/** Stub used off Windows and in tests. */
export const unavailableWin32: Win32 = {
  available: false,
  windowClassAt: () => null,
  isKeyDown: () => false,
};

export function createWin32(): Win32 {
  if (process.platform !== 'win32') return unavailableWin32;
  try {
    // koffi is loaded lazily so non-Windows dev machines never touch user32.
    const koffi = nodeRequire('koffi') as typeof import('koffi');
    const user32 = koffi.load('user32.dll');
    const POINT = koffi.struct('POINT', { x: 'int32', y: 'int32' });
    const WindowFromPoint = user32.func('void * __stdcall WindowFromPoint(POINT pt)');
    const GetAncestor = user32.func('void * __stdcall GetAncestor(void *hwnd, uint32 flags)');
    const GetClassNameW = user32.func(
      'int __stdcall GetClassNameW(void *hwnd, _Out_ uint16_t *buf, int max)',
    );
    const GetAsyncKeyState = user32.func('int16 __stdcall GetAsyncKeyState(int vk)');
    void POINT;
    return {
      available: true,
      windowClassAt(x, y) {
        try {
          const hwnd = WindowFromPoint({ x: Math.round(x), y: Math.round(y) });
          if (!hwnd) return null;
          const root = GetAncestor(hwnd, GA_ROOT) ?? hwnd;
          const buf = new Uint16Array(256);
          const n = GetClassNameW(root, buf, buf.length) as number;
          return n > 0 ? String.fromCharCode(...buf.subarray(0, n)) : null;
        } catch (error) {
          log.error('windowClassAt failed', error);
          return null;
        }
      },
      isKeyDown(vk) {
        try {
          return ((GetAsyncKeyState(vk) as number) & 0x8000) !== 0;
        } catch {
          return false;
        }
      },
    };
  } catch (error) {
    log.error('koffi/user32 unavailable; source gating disabled', error);
    return unavailableWin32;
  }
}
