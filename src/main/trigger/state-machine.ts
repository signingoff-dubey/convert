import type { WheelId } from '../../shared/formats';

/** No Electron or Win32 imports here: this module is pure and unit-tested (docs/02 section 4.1). */

export interface Point {
  x: number;
  y: number;
}

export const DRAG_THRESHOLD_PX = 6;
export const WATCHDOG_MS = 30_000;

export type State =
  | { kind: 'IDLE' }
  | { kind: 'ARMED'; origin: Point; lastMouseAt: number }
  | { kind: 'DRAGGING'; lastMouseAt: number }
  | { kind: 'WHEEL_OPEN'; wheel: WheelId; lastMouseAt: number };

export type DropTarget =
  { kind: 'wedge'; wedgeId: string } | { kind: 'hole' } | { kind: 'outside' };

export type Event =
  | { type: 'leftDown'; at: number; point: Point; sourceAllowed: boolean }
  | { type: 'move'; at: number; point: Point }
  | { type: 'leftUp'; at: number; overOverlay: boolean }
  | { type: 'combo'; at: number; wheel: WheelId; wheelEnabled: boolean }
  | { type: 'drop'; at: number; target: DropTarget }
  | { type: 'escape'; at: number }
  | { type: 'tick'; at: number }
  | { type: 'pause' };

export type Effect =
  | { type: 'openOverlay'; wheel: WheelId }
  | { type: 'switchOverlay'; wheel: WheelId }
  | { type: 'closeOverlay' }
  | { type: 'runJob'; wheel: WheelId; wedgeId: string };

export interface Transition {
  state: State;
  effects: Effect[];
}

export const initialState: State = { kind: 'IDLE' };

const IDLE: State = { kind: 'IDLE' };
const stay = (state: State): Transition => ({ state, effects: [] });

/** Returns to IDLE, closing the overlay if one is showing. */
function reset(from: State): Transition {
  return {
    state: IDLE,
    effects: from.kind === 'WHEEL_OPEN' ? [{ type: 'closeOverlay' }] : [],
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function touch(state: State, at: number): State {
  return state.kind === 'IDLE' ? state : { ...state, lastMouseAt: at };
}

export function reduce(state: State, event: Event): Transition {
  if (event.type === 'pause') return reset(state);

  if (event.type === 'tick') {
    if (state.kind !== 'IDLE' && event.at - state.lastMouseAt >= WATCHDOG_MS) return reset(state);
    return stay(state);
  }

  switch (state.kind) {
    case 'IDLE':
      if (event.type === 'leftDown' && event.sourceAllowed) {
        return stay({ kind: 'ARMED', origin: event.point, lastMouseAt: event.at });
      }
      return stay(state);

    case 'ARMED':
      if (event.type === 'move') {
        const next = touch(state, event.at);
        if (distance(state.origin, event.point) > DRAG_THRESHOLD_PX) {
          return stay({ kind: 'DRAGGING', lastMouseAt: event.at });
        }
        return stay(next);
      }
      if (event.type === 'leftUp' || event.type === 'escape') return reset(state);
      // Keys never act in ARMED, so typing outside a drag is never touched.
      return stay(state);

    case 'DRAGGING':
      if (event.type === 'combo') {
        if (!event.wheelEnabled) return stay(state);
        return {
          state: { kind: 'WHEEL_OPEN', wheel: event.wheel, lastMouseAt: state.lastMouseAt },
          effects: [{ type: 'openOverlay', wheel: event.wheel }],
        };
      }
      if (event.type === 'leftUp' || event.type === 'escape') return reset(state);
      if (event.type === 'move') return stay(touch(state, event.at));
      return stay(state);

    case 'WHEEL_OPEN':
      switch (event.type) {
        case 'combo':
          // Key repeat of the open combo, or a disabled wheel: no second event.
          if (event.wheel === state.wheel || !event.wheelEnabled) return stay(state);
          return {
            state: { ...state, wheel: event.wheel },
            effects: [{ type: 'switchOverlay', wheel: event.wheel }],
          };
        case 'drop':
          if (event.target.kind === 'wedge') {
            return {
              state: IDLE,
              effects: [
                { type: 'runJob', wheel: state.wheel, wedgeId: event.target.wedgeId },
                { type: 'closeOverlay' },
              ],
            };
          }
          return reset(state);
        case 'escape':
          return reset(state);
        case 'leftUp':
          // Over the overlay the drop event decides; anywhere else the drag simply ended.
          return event.overOverlay ? stay(touch(state, event.at)) : reset(state);
        case 'move':
          return stay(touch(state, event.at));
        default:
          return stay(state);
      }
  }
}
