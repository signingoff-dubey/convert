import { uIOhook } from 'uiohook-napi';
import type { HookSource, KeyHookEvent, MouseHookEvent } from './hooks-iface';

/**
 * uiohook-napi cannot consume events, so combos pass through to the source app. The OLE drag loop
 * in Explorer is expected to ignore stray keys (docs/02 section 4.3); Phase 0 must confirm on Windows.
 */
export function createUiohookSource(): HookSource {
  let running = false;
  const mouse = (e: { x: number; y: number; button?: unknown }): MouseHookEvent => ({
    x: e.x,
    y: e.y,
    button: typeof e.button === 'number' ? e.button : 0,
  });
  return {
    onMouseDown: (cb) => uIOhook.on('mousedown', (e) => cb(mouse(e))),
    onMouseUp: (cb) => uIOhook.on('mouseup', (e) => cb(mouse(e))),
    onMouseMove: (cb) => uIOhook.on('mousemove', (e) => cb(mouse(e))),
    onKeyDown: (cb) =>
      uIOhook.on('keydown', (e): void =>
        cb({
          keycode: e.keycode,
          shift: e.shiftKey,
          ctrl: e.ctrlKey,
          alt: e.altKey,
        } satisfies KeyHookEvent),
      ),
    start() {
      if (running) return;
      uIOhook.start();
      running = true;
    },
    stop() {
      if (!running) return;
      uIOhook.stop();
      running = false;
    },
  };
}
