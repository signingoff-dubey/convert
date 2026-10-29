import path from 'node:path';
import { BrowserWindow } from 'electron';
import type { ToolWindowName } from '../../shared/ipc';
import { allowPreview } from '../protocol';
import type { Settings } from '../settings/schema';
import { backgroundFor, createWindow, loadPage, preloadPath } from './common';
import type { WindowRegistry } from './registry';

const SIZES: Record<ToolWindowName, { width: number; height: number; resizable: boolean }> = {
  trim: { width: 520, height: 600, resizable: false },
  split: { width: 480, height: 540, resizable: false },
  merge: { width: 520, height: 600, resizable: false },
  compress: { width: 520, height: 640, resizable: false },
  metadata: { width: 600, height: 700, resizable: true },
  redact: { width: 980, height: 740, resizable: true },
  edit: { width: 1020, height: 740, resizable: true },
  crop: { width: 980, height: 740, resizable: true },
  'add-bg': { width: 1020, height: 740, resizable: true },
  annotate: { width: 1100, height: 780, resizable: true },
  collage: { width: 1020, height: 740, resizable: true },
};

const MAX_OPEN = 6;

interface Open {
  win: BrowserWindow;
  tool: ToolWindowName;
  /** Files this window may read or write: the dropped paths plus anything picked in its own dialogs. */
  allowed: Set<string>;
}

/** Small themed windows for Trim, Split, Merge and the image editors. */
export class ToolWindowManager {
  private open = new Map<number, Open>();

  constructor(
    private readonly registry: WindowRegistry,
    private readonly getSettings: () => Settings,
    private readonly prefersDark: () => boolean,
  ) {}

  async show(tool: ToolWindowName, paths: string[]): Promise<void> {
    if (this.open.size >= MAX_OPEN) return;
    const size = SIZES[tool];
    const win = createWindow(
      {
        ...size,
        minWidth: size.resizable ? 760 : size.width,
        minHeight: size.resizable ? 560 : size.height,
        show: false,
        frame: false,
        center: true,
        alwaysOnTop: false,
        skipTaskbar: false,
        title: `Convert: ${tool}`,
        backgroundColor: backgroundFor(this.getSettings(), this.prefersDark()),
      },
      preloadPath('toolwin'),
    );
    const id = win.webContents.id;
    const allowed = new Set(paths.map((p) => path.resolve(p)));
    this.open.set(id, { win, tool, allowed });
    this.registry.register(win, 'toolwin');
    allowPreview(paths);
    win.on('closed', () => this.open.delete(id));
    await loadPage(win, 'toolwin');
    win.webContents.send('toolwin:init', { tool, paths });
    win.show();
  }

  infoFor(webContentsId: number): Open | undefined {
    return this.open.get(webContentsId);
  }

  /** Adds a file the user picked inside the window, such as a background image. */
  allow(webContentsId: number, file: string): void {
    this.open.get(webContentsId)?.allowed.add(path.resolve(file));
    allowPreview([file]);
  }

  isAllowed(webContentsId: number, file: string): boolean {
    return this.open.get(webContentsId)?.allowed.has(path.resolve(file)) ?? false;
  }

  closeFor(webContentsId: number): void {
    this.open.get(webContentsId)?.win.close();
  }

  closeAll(): void {
    for (const { win } of this.open.values()) win.close();
  }
}
