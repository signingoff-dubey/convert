import { readFile } from 'node:fs/promises';
import type { BrowserWindow } from 'electron';
import { JobError } from '../jobs/types';
import type { PdfDocument, PdfPage, TextItem } from '../engines/pdf';
import { createWindow, loadPage } from '../windows/common';
import type { WindowRegistry } from '../windows/registry';

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

/**
 * Runs pdf.js in a hidden window and gives the engines the same document interface they use in plain Node.
 * One window is shared by all jobs; it is created on first use.
 */
export class PdfHost {
  private win: BrowserWindow | null = null;
  private ready: Promise<BrowserWindow> | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;

  constructor(private readonly registry: WindowRegistry) {}

  private async window(): Promise<BrowserWindow> {
    if (this.win && !this.win.isDestroyed()) return this.ready as Promise<BrowserWindow>;
    const win = createWindow(
      { show: false, width: 800, height: 600, skipTaskbar: true },
      'pdfrender',
    );
    win.webContents.setBackgroundThrottling(false);
    this.registry.register(win, 'pdfrender');
    win.on('closed', () => {
      this.win = null;
      this.ready = null;
      for (const p of this.pending.values()) p.reject(new Error('the PDF reader closed'));
      this.pending.clear();
    });
    this.win = win;
    this.ready = loadPage(win, 'pdfrender').then(() => win);
    return this.ready;
  }

  /** Called when the page answers a request. */
  settle(message: { id: number; ok: boolean; error?: string; value?: unknown }): void {
    const p = this.pending.get(message.id);
    if (!p) return;
    this.pending.delete(message.id);
    if (message.ok) p.resolve(message.value);
    else p.reject(Object.assign(new Error(message.error ?? 'failed'), { pdfError: message.error }));
  }

  private async call<T>(req: Record<string, unknown>): Promise<T> {
    const win = await this.window();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      win.webContents.send('pdfrender:req', { id, ...req });
    });
  }

  readonly open = async (path: string): Promise<PdfDocument> => {
    const data = new Uint8Array(await readFile(path));
    let opened: { doc: number; pages: number };
    try {
      opened = await this.call({ op: 'open', data });
    } catch (error) {
      if ((error as { pdfError?: string }).pdfError === 'password')
        throw new JobError('E_ENCRYPTED_PDF');
      throw new JobError('E_CORRUPT_INPUT', error instanceof Error ? error.message : 'pdf');
    }
    const doc = opened.doc;
    return {
      numPages: opened.pages,
      release: async () => {
        await this.call({ op: 'close', doc }).catch(() => undefined);
      },
      getPage: async (n): Promise<PdfPage> => {
        const size = await this.call<{ width: number; height: number }>({ op: 'size', doc, n });
        return {
          size: () => size,
          image: async (scale, format) =>
            Buffer.from(await this.call<Uint8Array>({ op: 'image', doc, n, scale, format })),
          text: () => this.call<TextItem[]>({ op: 'text', doc, n }),
          cleanup: () => undefined,
        };
      },
    };
  };

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
  }
}
