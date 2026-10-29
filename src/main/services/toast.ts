import { randomUUID } from 'node:crypto';
import type { JobQueue, JobSnapshot } from '../jobs/queue';
import type { Settings } from '../settings/schema';
import { buildToast, type ToastModel, type ToastWindow } from '../windows/toast-window';

/** Groups job updates by batch into toasts, and dismisses them after the configured time. */
export class ToastManager {
  private batches = new Map<string, Map<string, JobSnapshot>>();
  private infos = new Map<string, ToastModel>();
  private timers = new Map<string, NodeJS.Timeout>();
  private onActive: (running: boolean) => void = () => undefined;

  constructor(
    private readonly window: ToastWindow,
    private readonly getSettings: () => Settings,
    queue: JobQueue,
  ) {
    queue.on('update', (snap: JobSnapshot) => this.onJob(snap));
  }

  /** Called with true while any job runs; the tray shows its running dot from this. */
  onActivity(cb: (running: boolean) => void): void {
    this.onActive = cb;
  }

  info(text: string, kind: 'info' | 'error' = 'info'): void {
    const id = randomUUID();
    this.infos.set(id, {
      id,
      kind,
      title: text,
      jobIds: [],
      canCancel: false,
      canUndo: false,
      canReveal: false,
      seconds: this.getSettings().output.toastSeconds,
    });
    this.arm(id, kind === 'error' ? 2 : 1);
    void this.render();
  }

  dismiss(id: string): void {
    this.batches.delete(id);
    this.infos.delete(id);
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    void this.render();
  }

  private onJob(snap: JobSnapshot): void {
    const batch = this.batches.get(snap.batchId) ?? new Map<string, JobSnapshot>();
    batch.set(snap.id, snap);
    this.batches.set(snap.batchId, batch);
    const finished = [...batch.values()].every(
      (j) => j.status !== 'queued' && j.status !== 'running',
    );
    clearTimeout(this.timers.get(snap.batchId));
    if (finished) {
      const failed = [...batch.values()].some((j) => j.status === 'error');
      this.arm(snap.batchId, failed ? 2 : 1);
    }
    void this.render();
  }

  private arm(id: string, factor: number): void {
    clearTimeout(this.timers.get(id));
    const seconds = this.getSettings().output.toastSeconds * factor;
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), Math.max(2, seconds) * 1000),
    );
  }

  private async render(): Promise<void> {
    const seconds = this.getSettings().output.toastSeconds;
    const toasts: ToastModel[] = [
      ...[...this.batches.values()].map((b) => buildToast([...b.values()], seconds)),
      ...this.infos.values(),
    ];
    const running = toasts.some((t) => t.kind === 'progress');
    this.onActive(running);
    await this.window.set(toasts.slice(-4));
  }
}
