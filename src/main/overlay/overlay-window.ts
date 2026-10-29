import { BrowserWindow, screen } from 'electron';
import type { WheelId } from '../../shared/formats';
import { createWindow, loadPage, preloadPath } from '../windows/common';
import { logger } from '../services/log';
import type { Settings } from '../settings/schema';
import type { OverlayController } from '../trigger/hooks';
import type { Point } from '../trigger/state-machine';
import { physicalToDip, type DisplayInfo, type Rect } from './dpi';
import { OVERLAY_PADDING, WHEEL_DIAMETER, placeOverlay } from './geometry';

const log = logger('overlay');

function displays(): DisplayInfo[] {
  return screen.getAllDisplays().map((d) => ({
    bounds: d.bounds,
    scaleFactor: d.scaleFactor,
    physicalBounds:
      process.platform === 'win32'
        ? screen.dipToScreenRect(null, d.bounds)
        : {
            x: d.bounds.x * d.scaleFactor,
            y: d.bounds.y * d.scaleFactor,
            width: d.bounds.width * d.scaleFactor,
            height: d.bounds.height * d.scaleFactor,
          },
  }));
}

/** One pre-created hidden window, shown with showInactive so the source app keeps focus and the drag. */
export class OverlayManager implements OverlayController {
  private win: BrowserWindow | null = null;
  private bounds: Rect | null = null;
  private visible = false;

  constructor(
    private readonly getSettings: () => Settings,
    private readonly getFlags: () => { office: boolean; heic: boolean },
  ) {}

  async create(): Promise<void> {
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
        width: WHEEL_DIAMETER.m + OVERLAY_PADDING * 2,
        height: WHEEL_DIAMETER.m + OVERLAY_PADDING * 2,
      },
      preloadPath('overlay'),
    );
    win.setAlwaysOnTop(true, 'screen-saver');
    // Do not call setIgnoreMouseEvents: the drag must be able to reach this window (docs/02 section 5).
    await loadPage(win, 'overlay');
    this.win = win;
    win.on('closed', () => (this.win = null));
  }

  /** The overlay renderer reports drops through IPC; this is only for hit-testing mouse-up. */
  contains(cursorPhysical: Point): boolean {
    if (!this.visible || !this.bounds) return false;
    const p = physicalToDip(cursorPhysical, displays());
    const b = this.bounds;
    return p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
  }

  open(wheel: WheelId, cursorPhysical: Point): void {
    const win = this.win;
    if (!win) return;
    const started = performance.now();
    const dip = physicalToDip(cursorPhysical, displays());
    const display = screen.getDisplayNearestPoint({ x: Math.round(dip.x), y: Math.round(dip.y) });
    const size = this.getSettings().appearance.wheelSize;
    const placement = placeOverlay(dip, size, display.workArea);
    this.bounds = placement.window;
    // Set twice: Electron mis-scales the first setBounds when the target monitor has a different DPI.
    win.setBounds(placement.window);
    win.setBounds(placement.window);
    win.webContents.send('overlay:open', {
      wheelId: wheel,
      center: placement.wheelCenter,
      diameter: WHEEL_DIAMETER[size],
      flags: this.getFlags(),
    });
    win.showInactive();
    win.setAlwaysOnTop(true, 'screen-saver');
    this.visible = true;
    log.debug(
      `overlay shown in ${(performance.now() - started).toFixed(1)} ms (cursorInHole=${placement.cursorInHole})`,
    );
  }

  switchTo(wheel: WheelId): void {
    this.win?.webContents.send('overlay:switch', { wheelId: wheel });
  }

  message(text: string): void {
    this.win?.webContents.send('overlay:message', { text });
  }

  close(): void {
    if (!this.win || !this.visible) return;
    this.visible = false;
    this.win.webContents.send('overlay:close');
    this.win.hide();
  }

  destroy(): void {
    this.win?.destroy();
  }
}
