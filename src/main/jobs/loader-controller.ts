import { ProgressTracker, type Progress, type ProgressSnapshot } from './progress';

/** What the loader draws on. The real one is a small click-through window; tests use a fake. */
export interface LoaderSurface {
  /** Creates the window if needed. Slow the first time. */
  prepare(): Promise<void>;
  show(): void;
  hide(): void;
  push(state: Progress): void;
  /** Moves the ring to the pointer. */
  follow(): void;
}

export interface LoaderOptions {
  /** False when the user turned the ring off. */
  enabled(): boolean;
  /** Whether any job is really still running. A last check so the ring can never get stuck. */
  isBusy?(): boolean;
  /** Quick jobs finish before this, so they never flash a ring. */
  showAfterMs?: number;
  followMs?: number;
  watchdogMs?: number;
}

/**
 * Decides when the ring shows and hides. Showing is slow (the window may have to be created), so a job can
 * finish while it is happening; every hide therefore cancels any show that is still on its way.
 */
export class LoaderController {
  private tracker = new ProgressTracker();
  private showTimer: NodeJS.Timeout | null = null;
  private followTimer: NodeJS.Timeout | null = null;
  private watchdog: NodeJS.Timeout | null = null;
  private visible = false;
  /** Bumped by every hide: a show that started before it must not complete. */
  private epoch = 0;

  constructor(
    private readonly surface: LoaderSurface,
    private readonly options: LoaderOptions,
  ) {}

  get isVisible(): boolean {
    return this.visible;
  }

  update(snap: ProgressSnapshot): void {
    const state = this.tracker.update(snap);
    if (!this.options.enabled() || !state.active) return this.hide();
    if (this.visible) return this.surface.push(state);
    if (this.showTimer) return;
    const epoch = this.epoch;
    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      void this.reveal(epoch);
    }, this.options.showAfterMs ?? 600);
  }

  private async reveal(epoch: number): Promise<void> {
    await this.surface.prepare();
    // The jobs may all have finished while the window was being made.
    const state = this.tracker.state();
    if (epoch !== this.epoch || !state.active || !this.options.enabled()) return;
    this.visible = true;
    this.surface.follow();
    this.surface.push(state);
    this.surface.show();
    this.followTimer = setInterval(() => this.surface.follow(), this.options.followMs ?? 30);
    this.watchdog = setInterval(() => {
      if (this.options.isBusy && !this.options.isBusy()) {
        this.tracker.reset();
        this.hide();
      }
    }, this.options.watchdogMs ?? 2000);
  }

  hide(): void {
    this.epoch++;
    for (const t of [this.showTimer, this.followTimer, this.watchdog]) {
      if (t) {
        clearTimeout(t);
        clearInterval(t);
      }
    }
    this.showTimer = this.followTimer = this.watchdog = null;
    if (!this.visible) return;
    this.visible = false;
    this.surface.hide();
  }
}
