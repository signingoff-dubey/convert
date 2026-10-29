import type { BrowserWindow, WebContents } from 'electron';
import type { PageName } from '../../shared/ipc';

/** Maps each window's web contents to its page, so IPC handlers can check who is calling. */
export class WindowRegistry {
  private pages = new Map<number, PageName>();
  private windows = new Map<number, BrowserWindow>();

  register(win: BrowserWindow, page: PageName): void {
    const id = win.webContents.id;
    this.pages.set(id, page);
    this.windows.set(id, win);
    win.on('closed', () => {
      this.pages.delete(id);
      this.windows.delete(id);
    });
  }

  pageOf(contents: WebContents): PageName | null {
    return this.pages.get(contents.id) ?? null;
  }

  windowOf(contents: WebContents): BrowserWindow | null {
    return this.windows.get(contents.id) ?? null;
  }

  /** Sends an event to every open window that is allowed to hear it. */
  broadcast(allowedPages: readonly PageName[], event: string, payload: unknown): void {
    for (const [id, win] of this.windows) {
      const page = this.pages.get(id);
      if (page && allowedPages.includes(page) && !win.isDestroyed())
        win.webContents.send(event, payload);
    }
  }
}
