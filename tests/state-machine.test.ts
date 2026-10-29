import { describe, expect, it } from 'vitest';
import {
  WATCHDOG_MS,
  initialState,
  reduce,
  type Event,
  type State,
} from '../src/main/trigger/state-machine';

function run(events: Event[], from: State = initialState) {
  let state = from;
  const effects = [];
  for (const e of events) {
    const t = reduce(state, e);
    state = t.state;
    effects.push(...t.effects);
  }
  return { state, effects };
}

const down = (at = 0, sourceAllowed = true): Event => ({
  type: 'leftDown',
  at,
  point: { x: 0, y: 0 },
  sourceAllowed,
});
const move = (at: number, x: number, y = 0): Event => ({ type: 'move', at, point: { x, y } });
const combo = (wheel: 'convert' | 'tools' | 'actions', at = 100, wheelEnabled = true): Event => ({
  type: 'combo',
  at,
  wheel,
  wheelEnabled,
});
const dragging = [down(), move(10, 20)];

describe('arming and dragging', () => {
  it('ignores a disallowed source', () => {
    expect(run([down(0, false)]).state.kind).toBe('IDLE');
  });
  it('needs more than 6 px to start dragging', () => {
    expect(run([down(), move(1, 6)]).state.kind).toBe('ARMED');
    expect(run([down(), move(1, 7)]).state.kind).toBe('DRAGGING');
  });
  it('returns to idle on leftUp or Escape before dragging', () => {
    expect(run([down(), { type: 'leftUp', at: 1, overOverlay: false }]).state.kind).toBe('IDLE');
    expect(run([down(), { type: 'escape', at: 1 }]).state.kind).toBe('IDLE');
  });
});

describe('combos', () => {
  it('are ignored in IDLE and ARMED, so typing elsewhere does nothing', () => {
    expect(run([combo('convert')])).toEqual({ state: initialState, effects: [] });
    expect(run([down(), combo('convert')]).effects).toEqual([]);
  });
  it('open the wheel from DRAGGING exactly once, even with key repeat', () => {
    const r = run([...dragging, combo('convert'), combo('convert'), combo('convert')]);
    expect(r.effects).toEqual([{ type: 'openOverlay', wheel: 'convert' }]);
    expect(r.state).toMatchObject({ kind: 'WHEEL_OPEN', wheel: 'convert' });
  });
  it('ignore a disabled wheel', () => {
    expect(run([...dragging, combo('tools', 100, false)]).state.kind).toBe('DRAGGING');
  });
  it('switch wheels in place', () => {
    const r = run([...dragging, combo('convert'), combo('actions')]);
    expect(r.effects.at(-1)).toEqual({ type: 'switchOverlay', wheel: 'actions' });
    expect(r.state).toMatchObject({ kind: 'WHEEL_OPEN', wheel: 'actions' });
  });
});

describe('closing the wheel', () => {
  const open = [...dragging, combo('convert')];
  it('runs a job on a wedge drop', () => {
    const r = run([...open, { type: 'drop', at: 200, target: { kind: 'wedge', wedgeId: 'png' } }]);
    expect(r.state.kind).toBe('IDLE');
    expect(r.effects.slice(1)).toEqual([
      { type: 'runJob', wheel: 'convert', wedgeId: 'png' },
      { type: 'closeOverlay' },
    ]);
  });
  it.each([['hole'], ['outside']] as const)('cancels on a drop in the %s', (kind) => {
    const r = run([...open, { type: 'drop', at: 200, target: { kind } }]);
    expect(r.state.kind).toBe('IDLE');
    expect(r.effects.at(-1)).toEqual({ type: 'closeOverlay' });
    expect(r.effects.some((e) => e.type === 'runJob')).toBe(false);
  });
  it('cancels on Escape', () => {
    expect(run([...open, { type: 'escape', at: 200 }]).effects.at(-1)).toEqual({
      type: 'closeOverlay',
    });
  });
  it('waits for the drop when released over the overlay, cancels elsewhere', () => {
    expect(run([...open, { type: 'leftUp', at: 200, overOverlay: true }]).state.kind).toBe(
      'WHEEL_OPEN',
    );
    expect(run([...open, { type: 'leftUp', at: 200, overOverlay: false }]).state.kind).toBe('IDLE');
  });
  it('closes on pause', () => {
    expect(run([...open, { type: 'pause' }]).effects.at(-1)).toEqual({ type: 'closeOverlay' });
  });
});

describe('watchdog', () => {
  it('resets a stuck wheel after 30 s without mouse events', () => {
    const r = run([...dragging, combo('convert'), { type: 'tick', at: 10 + WATCHDOG_MS }]);
    expect(r.state.kind).toBe('IDLE');
    expect(r.effects.at(-1)).toEqual({ type: 'closeOverlay' });
  });
  it('is held off by mouse movement', () => {
    const r = run([...dragging, combo('convert'), move(25_000, 50), { type: 'tick', at: 40_000 }]);
    expect(r.state.kind).toBe('WHEEL_OPEN');
  });
  it('does nothing in IDLE', () => {
    expect(run([{ type: 'tick', at: 1e9 }]).effects).toEqual([]);
  });
});
