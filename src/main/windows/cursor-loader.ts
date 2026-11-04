import { BrowserWindow, screen } from 'electron';
import type { JobSnapshot } from '../jobs/queue';
import { LoaderController, type LoaderSurface } from '../jobs/loader-controller';
import type { Progress } from '../jobs/progress';
import { placeBadge } from '../overlay/geometry';
import type { Settings } from '../settings/schema';
import { createWindow, loadPage } from './common';
import type { WindowRegistry } from './registry';

const SIZE = 56;

/**
 * A small click-through progress ring that follows the pointer while jobs that take time are running.
 * The window is created on first use; when to show and hide it is decided by LoaderController.
 */
export class CursorLoader implements LoaderSurface {
  private win: BrowserWindow | null = null;
  private ready: Promise<void> | null = null;
  private last = { percent: -1, indeterminate: false, count: -1 };
  private lastPos = { x: -1, y: -1 };
  private readonly controller: LoaderController;

  constructor(
    private readonly registry: WindowRegistry,
    private readonly getSettings: () => Settings,
    isBusy?: () => boolean,
  ) {
    this.controller = new LoaderController(this, {
      enabled: () => getSettings().output.cursorLoader,
      isBusy,
    });
  }

  update(snap: JobSnapshot): void {
    this.controller.update(snap);
  }

  async prepare(): Promise<void> {
    if (this.win && !this.win.isDestroyed()) return void (await this.ready);
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
  }

  show(): void {
    this.win?.showInactive();
  }

  follow(): void {
    if (!this.win || this.win.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    const pos = placeBadge(cursor, SIZE, area);
    if (pos.x === this.lastPos.x && pos.y === this.lastPos.y) return;
    this.lastPos = pos;
    this.win.setPosition(Math.round(pos.x), Math.round(pos.y));
  }

  push(state: Progress): void {
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
    this.last = { percent: -1, indeterminate: false, count: -1 };
    this.win?.hide();
  }

  destroy(): void {
    this.controller.hide();
    this.win?.destroy();
  }
}
