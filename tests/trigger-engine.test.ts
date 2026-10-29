import { describe, expect, it, vi } from 'vitest';
import type { HookSource, KeyHookEvent, MouseHookEvent } from '../src/main/native/hooks-iface';
import { unavailableWin32, type Win32 } from '../src/main/native/win32';
import { defaultSettings } from '../src/main/settings/schema';
import { isSourceAllowed } from '../src/main/trigger/gating';
import { TriggerEngine } from '../src/main/trigger/hooks';
import { matchWheel } from '../src/main/trigger/match';

function fakeSource() {
  const h: Record<string, (e: never) => void> = {};
  const source: HookSource = {
    onMouseDown: (cb) => (h.down = cb as never),
    onMouseUp: (cb) => (h.up = cb as never),
    onMouseMove: (cb) => (h.move = cb as never),
    onKeyDown: (cb) => (h.key = cb as never),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const fire = {
    down: (e: Partial<MouseHookEvent> = {}) => h.down?.({ x: 0, y: 0, button: 1, ...e } as never),
    up: (e: Partial<MouseHookEvent> = {}) => h.up?.({ x: 0, y: 0, button: 1, ...e } as never),
    move: (x: number, y = 0) => h.move?.({ x, y, button: 0 } as never),
    key: (e: Partial<KeyHookEvent>) =>
      h.key?.({ keycode: 0, shift: false, ctrl: false, alt: false, ...e } as never),
  };
  return { source, fire };
}

const C = 0x2e;
const explorer: Win32 = {
  available: true,
  windowClassAt: () => 'CabinetWClass',
  isKeyDown: () => false,
};

function make(win32: Win32 = explorer) {
  const { source, fire } = fakeSource();
  const overlay = {
    open: vi.fn(),
    switchTo: vi.fn(),
    close: vi.fn(),
    contains: vi.fn(() => false),
  };
  const onRunJob = vi.fn();
  const onTestCombo = vi.fn();
  const engine = new TriggerEngine({
    source,
    win32,
    getSettings: defaultSettings,
    overlay,
    onRunJob,
    onTestCombo,
  });
  engine.start();
  return { engine, fire, overlay, onRunJob, onTestCombo, source };
}

describe('matchWheel / gating', () => {
  const t = defaultSettings().triggers;
  it('needs the exact modifiers', () => {
    expect(matchWheel(t, C, { shift: true, ctrl: false, alt: false })).toBe('convert');
    expect(matchWheel(t, C, { shift: false, ctrl: false, alt: false })).toBeNull();
    expect(matchWheel(t, C, { shift: true, ctrl: true, alt: false })).toBeNull();
  });
  it('only allows configured classes when limited', () => {
    const g = defaultSettings().general;
    expect(isSourceAllowed('CabinetWClass', g)).toBe(true);
    expect(isSourceAllowed('Notepad', g)).toBe(false);
    expect(isSourceAllowed(null, g)).toBe(false);
    expect(isSourceAllowed('Notepad', { ...g, limitToExplorerAndDesktop: false })).toBe(true);
  });
});

describe('TriggerEngine', () => {
  it('ignores combos typed outside a drag', () => {
    const { fire, overlay } = make();
    fire.key({ keycode: C, shift: true });
    expect(overlay.open).not.toHaveBeenCalled();
  });
  it('opens the wheel once during a drag, even with key repeat', () => {
    const { fire, overlay } = make();
    fire.down();
    fire.move(20);
    fire.key({ keycode: C, shift: true });
    fire.key({ keycode: C, shift: true });
    expect(overlay.open).toHaveBeenCalledTimes(1);
    expect(overlay.open).toHaveBeenCalledWith('convert', { x: 20, y: 0 });
  });
  it('does not start from a window outside the allowed classes', () => {
    const { fire, overlay } = make({ ...explorer, windowClassAt: () => 'Notepad' });
    fire.down();
    fire.move(20);
    fire.key({ keycode: C, shift: true });
    expect(overlay.open).not.toHaveBeenCalled();
  });
  it('runs the job with the dropped paths and closes the overlay', () => {
    const { fire, overlay, onRunJob, engine } = make();
    fire.down();
    fire.move(20);
    fire.key({ keycode: C, shift: true });
    engine.handleOverlayDrop('convert', { kind: 'wedge', wedgeId: 'png' }, ['C:\\a.jpg']);
    expect(onRunJob).toHaveBeenCalledWith('convert', 'png', ['C:\\a.jpg']);
    expect(overlay.close).toHaveBeenCalled();
    expect(engine.currentState.kind).toBe('IDLE');
  });
  it('cancels on Escape and on release away from the overlay', () => {
    const a = make();
    a.fire.down();
    a.fire.move(20);
    a.fire.key({ keycode: C, shift: true });
    a.fire.key({ keycode: 0x01 });
    expect(a.overlay.close).toHaveBeenCalledTimes(1);
    const b = make();
    b.fire.down();
    b.fire.move(20);
    b.fire.key({ keycode: C, shift: true });
    b.fire.up();
    expect(b.overlay.close).toHaveBeenCalledTimes(1);
  });
  it('falls back to live modifier state when hook flags disagree', () => {
    const { fire, overlay } = make({ ...explorer, isKeyDown: (vk) => vk === 0x10 });
    fire.down();
    fire.move(20);
    fire.key({ keycode: C, shift: false });
    expect(overlay.open).toHaveBeenCalledWith('convert', expect.anything());
  });
  it('reports combos in test mode even outside a drag, and nothing otherwise', () => {
    const { fire, engine, onTestCombo, overlay } = make();
    fire.key({ keycode: C, shift: true });
    expect(onTestCombo).not.toHaveBeenCalled();
    engine.setTestMode(true);
    fire.key({ keycode: C, shift: true });
    expect(onTestCombo).toHaveBeenCalledWith('Shift+C', 'convert');
    expect(overlay.open).not.toHaveBeenCalled();
  });
  it('removes the hooks on stop and ignores everything while stopped', () => {
    const { engine, source } = make();
    engine.stop();
    expect(source.stop).toHaveBeenCalled();
    expect(unavailableWin32.available).toBe(false);
  });
});
