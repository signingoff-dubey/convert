import path from 'node:path';
import { app, BrowserWindow, nativeImage, screen } from 'electron';
import type { DockEdge } from '../services/state';
import type { Settings } from '../settings/schema';
import { backgroundFor, createWindow, loadPage } from './common';
import type { WindowRegistry } from './registry';

export interface FloatItem {
  path: string;
  name: string;
}

const THICK = { vertical: 140, horizontal: 128 };
const ITEM = 84;

/** Pure: window rectangle for a dock edge, a work area and an item count. */
export function dockBounds(
  edge: DockEdge,
  area: { x: number; y: number; width: number; height: number },
  count: number,
): { x: number; y: number; width: number; height: number } {
  const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
  const long = clamp(
    count * ITEM + 76,
    160,
    edge === 'left' || edge === 'right' ? area.height : area.width,
  );
  if (edge === 'left' || edge === 'right') {
    return {
      x: edge === 'left' ? area.x : area.x + area.width - THICK.vertical,
      y: area.y + Math.round((area.height - long) / 2),
      width: THICK.vertical,
      height: long,
    };
  }
  if (edge === 'top' || edge === 'bottom') {
    return {
      x: area.x + Math.round((area.width - long) / 2),
      y: edge === 'top' ? area.y : area.y + area.height - THICK.horizontal,
      width: long,
      height: THICK.horizontal,
    };
  }
  return { x: area.x + area.width - 360, y: area.y + 80, width: 320, height: 300 };
}

/** The Float shelf: a small always-on-top strip of draggable file chips. */
export class FloatShelf {
  private items: FloatItem[] = [];
  private win: BrowserWindow | null = null;

  constructor(
    private readonly registry: WindowRegistry,
    private readonly getSettings: () => Settings,
    private readonly prefersDark: () => boolean,
    private readonly getEdge: () => DockEdge,
    private readonly setEdge: (edge: DockEdge) => void,
  ) {}

  list(): FloatItem[] {
    return [...this.items];
  }

  has(file: string): boolean {
    return this.items.some((i) => i.path === file);
  }

  async add(paths: string[]): Promise<void> {
    for (const p of paths) {
      if (!this.has(p)) this.items.push({ path: p, name: path.basename(p) });
    }
    await this.show();
    this.changed();
  }

  remove(file: string): void {
    this.items = this.items.filter((i) => i.path !== file);
    this.changed();
  }

  clear(): void {
    this.items = [];
    this.changed();
  }

  dock(edge: DockEdge): void {
    this.setEdge(edge);
    this.layout();
  }

  edge(): DockEdge {
    return this.getEdge();
  }

  async show(): Promise<void> {
    if (this.win && !this.win.isDestroyed()) {
      this.win.showInactive();
      return;
    }
    const win = createWindow(
      {
        show: false,
        frame: false,
        resizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        transparent: false,
        backgroundColor: backgroundFor(this.getSettings(), this.prefersDark()),
        width: 160,
        height: 300,
      },
      'float',
    );
    win.setAlwaysOnTop(true, 'floating');
    this.win = win;
    this.registry.register(win, 'float');
    win.on('closed', () => (this.win = null));
    await loadPage(win, 'float');
    this.layout();
    win.showInactive();
  }

  hide(): void {
    this.win?.hide();
  }

  /** Starts a native drag so the chip can be dropped into another app. */
  async startDrag(sender: Electron.WebContents, file: string): Promise<void> {
    if (!this.has(file)) return;
    await this.startDragOf(sender, file);
  }

  /** Native drag of any file the app itself produced, such as the onboarding sample. */
  async startDragOf(sender: Electron.WebContents, file: string): Promise<void> {
    const icon = await app
      .getFileIcon(file, { size: 'normal' })
      .catch(() => nativeImage.createEmpty());
    sender.startDrag({ file, icon: icon.isEmpty() ? nativeImage.createFromDataURL(BLANK) : icon });
  }

  private changed(): void {
    this.layout();
    this.win?.webContents.send('float:changed', this.items);
  }

  private layout(): void {
    if (!this.win || this.win.isDestroyed()) return;
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    this.win.setBounds(dockBounds(this.getEdge(), area, this.items.length));
  }

  destroy(): void {
    this.win?.destroy();
  }
}

/** 1x1 transparent PNG, used when the OS cannot give a file icon. */
const BLANK =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
