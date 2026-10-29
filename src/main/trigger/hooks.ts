import type { WheelId } from '../../shared/formats';
import { formatCombo } from '../settings/conflicts';
import type { Settings } from '../settings/schema';
import { logger } from '../services/log';
import type { HookSource } from '../native/hooks-iface';
import { VK, type Win32 } from '../native/win32';
import { isSourceAllowed } from './gating';
import { matchWheel, wheelsForKeycode, type Modifiers } from './match';
import {
  initialState,
  reduce,
  type DropTarget,
  type Effect,
  type Event,
  type Point,
  type State,
} from './state-machine';

const log = logger('trigger');
const ESC_KEYCODE = 0x01;
const TICK_MS = 5_000;
const DROP_GRACE_MS = 1_000;

export interface OverlayController {
  open(wheel: WheelId, cursorPhysical: Point): void;
  switchTo(wheel: WheelId): void;
  close(): void;
  /** Whether a physical-pixel point is inside the overlay window. */
  contains(cursorPhysical: Point): boolean;
}

export interface TriggerDeps {
  source: HookSource;
  win32: Win32;
  getSettings(): Settings;
  overlay: OverlayController;
  onRunJob(wheel: WheelId, wedgeId: string, paths: string[]): void;
  /** Called while Test combos is on, even outside a drag. */
  onTestCombo?(combo: string, wheel: WheelId | null): void;
  now?(): number;
}

/** Hooks, then the pure state machine, then effects. Key events are only acted on while dragging. */
export class TriggerEngine {
  private state: State = initialState;
  private running = false;
  private wired = false;
  private testMode = false;
  private lastCursor: Point = { x: 0, y: 0 };
  private tickTimer: NodeJS.Timeout | null = null;
  private graceTimer: NodeJS.Timeout | null = null;
  private pendingPaths: string[] = [];

  constructor(private readonly deps: TriggerDeps) {}

  get currentState(): State {
    return this.state;
  }

  setTestMode(on: boolean): void {
    this.testMode = on;
  }

  /** Starts the hooks. Pause removes them entirely, so nothing is observed while paused. */
  start(): void {
    if (this.running) return;
    if (!this.wired) {
      this.wire();
      this.wired = true;
    }
    this.deps.source.start();
    this.running = true;
    this.tickTimer = setInterval(() => this.dispatch({ type: 'tick', at: this.now() }), TICK_MS);
    log.info('trigger engine started');
  }

  stop(): void {
    if (!this.running) return;
    this.dispatch({ type: 'pause' });
    this.deps.source.stop();
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.running = false;
    log.info('trigger engine stopped');
  }

  /** The overlay renderer reports a drop on a wedge, the hole or outside the wheel. */
  handleOverlayDrop(wheel: WheelId, target: DropTarget, paths: string[]): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.pendingPaths = paths;
    this.dispatch({ type: 'drop', at: this.now(), target });
    this.pendingPaths = [];
    void wheel;
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private wire(): void {
    const { source } = this.deps;
    source.onMouseDown((e) => {
      if (e.button !== 1) return;
      this.lastCursor = { x: e.x, y: e.y };
      const settings = this.deps.getSettings();
      const allowed = isSourceAllowed(this.deps.win32.windowClassAt(e.x, e.y), settings.general);
      this.dispatch({
        type: 'leftDown',
        at: this.now(),
        point: this.lastCursor,
        sourceAllowed: allowed,
      });
    });
    source.onMouseMove((e) => {
      this.lastCursor = { x: e.x, y: e.y };
      if (this.state.kind === 'IDLE') return;
      this.dispatch({ type: 'move', at: this.now(), point: this.lastCursor });
    });
    source.onMouseUp((e) => {
      if (e.button !== 1 || this.state.kind === 'IDLE') return;
      const overOverlay = this.deps.overlay.contains({ x: e.x, y: e.y });
      this.dispatch({ type: 'leftUp', at: this.now(), overOverlay });
      if (this.state.kind === 'WHEEL_OPEN') this.armDropGrace();
    });
    source.onKeyDown((e) => {
      const triggers = this.deps.getSettings().triggers;
      const active = this.state.kind === 'DRAGGING' || this.state.kind === 'WHEEL_OPEN';
      if (e.keycode === ESC_KEYCODE) {
        if (this.state.kind !== 'IDLE') this.dispatch({ type: 'escape', at: this.now() });
        return;
      }
      // Cheap exit: keys that are nobody's main key are never inspected further, and nothing is stored.
      if (!active && !this.testMode) return;
      if (wheelsForKeycode(triggers, e.keycode).length === 0) return;
      const wheel = matchWheel(triggers, e.keycode, e) ?? this.matchLive(triggers, e.keycode);
      if (this.testMode && wheel) {
        this.deps.onTestCombo?.(formatCombo(triggers[wheel]), wheel);
      }
      if (!active || wheel === null) return;
      log.debug(`combo matched: ${formatCombo(triggers[wheel])}`);
      this.dispatch({ type: 'combo', at: this.now(), wheel, wheelEnabled: true });
    });
  }

  /** Re-reads modifier state from Win32 when the hook's flags disagree (docs/02 section 4.3). */
  private matchLive(triggers: Settings['triggers'], keycode: number): WheelId | null {
    if (!this.deps.win32.available) return null;
    const mods: Modifiers = {
      shift: this.deps.win32.isKeyDown(VK.SHIFT),
      ctrl: this.deps.win32.isKeyDown(VK.CONTROL),
      alt: this.deps.win32.isKeyDown(VK.MENU),
    };
    return matchWheel(triggers, keycode, mods);
  }

  /** If the button was released over the overlay but no drop arrives, cancel instead of hanging. */
  private armDropGrace(): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null;
      if (this.state.kind === 'WHEEL_OPEN') this.dispatch({ type: 'escape', at: this.now() });
    }, DROP_GRACE_MS);
  }

  private dispatch(event: Event): void {
    const t = reduce(this.state, event);
    this.state = t.state;
    for (const effect of t.effects) this.run(effect);
  }

  private run(effect: Effect): void {
    switch (effect.type) {
      case 'openOverlay':
        this.deps.overlay.open(effect.wheel, this.lastCursor);
        break;
      case 'switchOverlay':
        this.deps.overlay.switchTo(effect.wheel);
        break;
      case 'closeOverlay':
        this.deps.overlay.close();
        break;
      case 'runJob':
        this.deps.onRunJob(effect.wheel, effect.wedgeId, this.pendingPaths);
        break;
    }
  }
}
