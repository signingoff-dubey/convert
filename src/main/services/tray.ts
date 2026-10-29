import { Menu, nativeImage, Tray } from 'electron';
import sharp from 'sharp';
import { logoSvg } from '../../shared/logo';

export interface TrayActions {
  openSettings(): void;
  togglePause(): void;
  showFloat(): void;
  openLog(): void;
  quit(): void;
  isPaused(): boolean;
}

async function icon(busy: boolean, accent: string): Promise<Electron.NativeImage> {
  const png = await sharp(Buffer.from(logoSvg(64, accent, busy)))
    .png()
    .toBuffer();
  return nativeImage.createFromBuffer(png, { scaleFactor: 4 });
}

/** Tray icon with a running dot while jobs are in progress (docs/01 section 6). */
export class TrayService {
  private tray: Tray | null = null;
  private busy = false;
  private images: { idle: Electron.NativeImage; busy: Electron.NativeImage } | null = null;

  constructor(
    private readonly actions: TrayActions,
    private accent: string,
  ) {}

  async init(): Promise<void> {
    this.images = { idle: await icon(false, this.accent), busy: await icon(true, this.accent) };
    this.tray = new Tray(this.images.idle);
    this.tray.setToolTip('Convert');
    this.tray.on('click', () => this.actions.openSettings());
    this.refresh();
  }

  setBusy(busy: boolean): void {
    if (busy === this.busy || !this.tray || !this.images) return;
    this.busy = busy;
    this.tray.setImage(busy ? this.images.busy : this.images.idle);
  }

  /** Rebuilds the menu so the Pause/Resume label matches the real state. */
  refresh(): void {
    this.tray?.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: this.actions.isPaused() ? 'Resume Convert' : 'Pause Convert',
          click: () => this.actions.togglePause(),
        },
        { label: 'Open Settings', click: () => this.actions.openSettings() },
        { label: 'Show Float shelf', click: () => this.actions.showFloat() },
        { label: 'Open output log', click: () => this.actions.openLog() },
        { type: 'separator' },
        { label: 'Quit', click: () => this.actions.quit() },
      ]),
    );
    this.tray?.setToolTip(this.actions.isPaused() ? 'Convert (paused)' : 'Convert');
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}
