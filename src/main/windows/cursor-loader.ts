import { BrowserWindow, screen } from 'electron';
import type { JobSnapshot } from '../jobs/queue';
import { ProgressTracker } from '../jobs/progress';
import { placeBadge } from '../overlay/geometry';
import type { Settings } from '../settings/schema';
import { createWindow, loadPage } from './common';
import type { WindowRegistry } from './registry';

const SIZE = 56;
/** Quick jobs finish before this, so they never flash a loader. */
const SHOW_AFTER_MS = 600;
const FOLLOW_MS = 30;

/**
 * A small click-through progress ring that follows the pointer while jobs that take time are running.
 * It is created on first use and only polls the cursor while it is visible.
 */
export class CursorLoader {
  private win: BrowserWindow | null = null;
  private ready: Promise<void> | null = null;
  private tracker = new ProgressTracker();
  private showTimer: NodeJS.Timeout | null = null;
  private followTimer: NodeJS.Timeout | null = null;
  private visible = false;
  private last = { percent: -1, indeterminate: false, count: -1 };
  private lastPos = { x: -1, y: -1 };

  constructor(
    private readonly registry: WindowRegistry,
    private readonly getSettings: () => Settings,
  ) {}

  update(snap: JobSnapshot): void {
    const state = this.tracker.update(snap);
    if (!this.getSettings().output.cursorLoader || !state.active) return this.hide();
    if (this.visible) return this.push(state);
    this.showTimer ??= setTimeout(() => {
      this.showTimer = null;
      void this.show();
    }, SHOW_AFTER_MS);
  }

  private async ensure(): Promise<BrowserWindow> {
    if (this.win && !this.win.isDestroyed()) {
      await this.ready;
      return this.win;
    }
    const win = createWindow(
      {
        show: false,
        frame: false,
        transparent: true,
        resizable: false,
        skipTaskbar: true,
        focusable: false,
        hasShadow: false,
        alwaysOnTop: true,
        width: SIZE,
        height: SIZE,
      },
      'loader',
    );
    win.setAlwaysOnTop(true, 'screen-saver');
    // Click-through: it must never take a click meant for the window underneath.
    win.setIgnoreMouseEvents(true);
    this.win = win;
    this.registry.register(win, 'loader');
    win.on('closed', () => (this.win = null));
    this.ready = loadPage(win, 'loader');
    await this.ready;
    return win;
  }

  private async show(): Promise<void> {
    const state = this.tracker.state();
    if (!state.active) return;
    const win = await this.ensure();
    this.visible = true;
    this.follow();
    this.push(state);
    win.showInactive();
    this.followTimer ??= setInterval(() => this.follow(), FOLLOW_MS);
  }

  private follow(): void {
    if (!this.win || this.win.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    const pos = placeBadge(cursor, SIZE, area);
    if (pos.x === this.lastPos.x && pos.y === this.lastPos.y) return;
    this.lastPos = pos;
    this.win.setPosition(Math.round(pos.x), Math.round(pos.y));
  }

  private push(state: { percent: number; indeterminate: boolean; count: number }): void {
    if (
      state.percent === this.last.percent &&
      state.indeterminate === this.last.indeterminate &&
      state.count === this.last.count
    )
      return;
    this.last = { percent: state.percent, indeterminate: state.indeterminate, count: state.count };
    this.win?.webContents.send('loader:update', state);
  }

  hide(): void {
    if (this.showTimer) clearTimeout(this.showTimer);
    this.showTimer = null;
    if (this.followTimer) clearInterval(this.followTimer);
    this.followTimer = null;
    if (!this.visible) return;
    this.visible = false;
    this.last = { percent: -1, indeterminate: false, count: -1 };
    this.win?.hide();
  }

  destroy(): void {
    this.hide();
    this.win?.destroy();
  }
}
