import { BrowserWindow } from 'electron';
import type { Settings } from '../settings/schema';
import { backgroundFor, createWindow, loadPage } from './common';
import type { WindowRegistry } from './registry';

/** One instance, created on demand and destroyed on close to save RAM (docs/03 section 1). */
export class SettingsWindow {
  private win: BrowserWindow | null = null;

  constructor(
    private readonly registry: WindowRegistry,
    private readonly getSettings: () => Settings,
    private readonly prefersDark: () => boolean,
  ) {}

  async open(): Promise<void> {
    if (this.win && !this.win.isDestroyed()) {
      if (this.win.isMinimized()) this.win.restore();
      this.win.focus();
      return;
    }
    const isWin11 =
      process.platform === 'win32' && Number(process.getSystemVersion().split('.')[2]) >= 22000;
    const win = createWindow(
      {
        width: 920,
        height: 660,
        minWidth: 760,
        minHeight: 540,
        show: false,
        center: true,
        title: 'Convert',
        backgroundColor: backgroundFor(this.getSettings(), this.prefersDark()),
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: '#00000000', symbolColor: '#888888', height: 40 },
        ...(isWin11 ? { backgroundMaterial: 'mica' as const } : {}),
      },
      'settings',
    );
    this.win = win;
    this.registry.register(win, 'settings');
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => (this.win = null));
    await loadPage(win, 'settings');
  }

  close(): void {
    this.win?.close();
  }

  isOpen(): boolean {
    return this.win !== null && !this.win.isDestroyed();
  }
}
