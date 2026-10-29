import path from 'node:path';
import { BrowserWindow, screen } from 'electron';
import { STRINGS } from '../../shared/strings';
import type { JobSnapshot } from '../jobs/queue';
import type { Settings } from '../settings/schema';
import { createWindow, loadPage, preloadPath } from './common';

export interface ToastModel {
  id: string;
  kind: 'progress' | 'success' | 'error' | 'info' | 'cancelled';
  title: string;
  detail?: string;
  percent?: number;
  stalled?: boolean;
  jobIds: string[];
  canCancel: boolean;
  canUndo: boolean;
  canReveal: boolean;
  seconds: number;
}

const TOAST_W = 380;
const TOAST_H = 92;
const GAP = 8;

function errorText(code: string): string {
  const table = STRINGS.errors as Record<string, string>;
  return table[code] ?? STRINGS.errors.E_UNKNOWN;
}

/** Folds the jobs of one batch into a single toast: "Converted 5 files". */
export function buildToast(batch: JobSnapshot[], seconds: number): ToastModel {
  const first = batch[0] as JobSnapshot;
  const n = batch.length;
  const running = batch.filter((j) => j.status === 'queued' || j.status === 'running');
  const failed = batch.filter((j) => j.status === 'error');
  const ok = batch.filter((j) => j.status === 'ok');
  const base = { id: first.batchId, jobIds: batch.map((j) => j.id), seconds };
  if (running.length > 0) {
    const percent = Math.round(
      batch.reduce((sum, j) => sum + (j.status === 'queued' ? 0 : j.percent), 0) / n,
    );
    return {
      ...base,
      kind: 'progress',
      title: n === 1 ? STRINGS.toast.running(first.inputName) : STRINGS.toast.runningMany(n),
      percent,
      stalled: running.some((j) => j.stalled),
      detail: running.some((j) => j.stalled) ? STRINGS.toast.stalled : undefined,
      canCancel: true,
      canUndo: false,
      canReveal: false,
    };
  }
  if (failed.length > 0) {
    const f = failed[0] as JobSnapshot;
    return {
      ...base,
      kind: 'error',
      title: n === 1 ? STRINGS.toast.failed(f.inputName) : `${failed.length} of ${n} failed`,
      detail: errorText(f.error?.code ?? 'E_UNKNOWN'),
      canCancel: false,
      canUndo: ok.some((j) => j.undoable),
      canReveal: ok.length > 0,
    };
  }
  if (ok.length === 0) {
    return {
      ...base,
      kind: 'cancelled',
      title: STRINGS.toast.cancelled,
      canCancel: false,
      canUndo: false,
      canReveal: false,
    };
  }
  const label = STRINGS.toolLabels[first.opId] ?? '';
  const compact = ok.every((j) => j.note === 'already-compact');
  const title = compact
    ? STRINGS.toast.alreadyCompact
    : first.opKind === 'convert'
      ? n === 1
        ? STRINGS.toast.converted(first.inputName, first.outputName ?? '')
        : STRINGS.toast.convertedMany(n)
      : n === 1
        ? STRINGS.toast.toolDone(label, first.inputName)
        : STRINGS.toast.toolDoneMany(label, n);
  return {
    ...base,
    kind: 'success',
    title,
    canCancel: false,
    canUndo: !compact && ok.every((j) => j.undoable),
    canReveal: !compact,
  };
}

/** One small transparent window in a screen corner; created on first use. */
export class ToastWindow {
  private win: BrowserWindow | null = null;
  private ready: Promise<void> | null = null;
  private toasts: ToastModel[] = [];

  constructor(private readonly getSettings: () => Settings) {}

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
        width: TOAST_W,
        height: TOAST_H,
      },
      preloadPath('toast'),
    );
    win.setAlwaysOnTop(true, 'screen-saver');
    this.win = win;
    this.ready = loadPage(win, 'toast');
    win.on('closed', () => (this.win = null));
    await this.ready;
    return win;
  }

  async set(toasts: ToastModel[]): Promise<void> {
    this.toasts = toasts;
    if (toasts.length === 0) {
      this.win?.hide();
      return;
    }
    const win = await this.ensure();
    const area = screen.getPrimaryDisplay().workArea;
    const height = toasts.length * (TOAST_H + GAP) + GAP;
    const pos = this.getSettings().output.toastPosition;
    const x = pos === 'bottomLeft' ? area.x + 12 : area.x + area.width - TOAST_W - 12;
    const y = pos === 'topRight' ? area.y + 12 : area.y + area.height - height - 12;
    win.setBounds({ x, y, width: TOAST_W, height });
    win.webContents.send('toast:update', toasts);
    if (!win.isVisible()) win.showInactive();
  }

  current(): ToastModel[] {
    return this.toasts;
  }

  destroy(): void {
    this.win?.destroy();
  }
}

export function displayName(p: string): string {
  return path.basename(p);
}
