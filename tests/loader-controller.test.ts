import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoaderController, type LoaderSurface } from '../src/main/jobs/loader-controller';
import type { Progress, ProgressSnapshot } from '../src/main/jobs/progress';

function fake(prepareMs = 0) {
  const calls: string[] = [];
  const surface: LoaderSurface = {
    prepare: () =>
      new Promise((r) => setTimeout(r, prepareMs)).then(() => void calls.push('prepare')),
    show: () => void calls.push('show'),
    hide: () => void calls.push('hide'),
    push: (p: Progress) => void calls.push(`push ${p.percent}`),
    follow: () => void calls.push('follow'),
  };
  return { surface, calls };
}
const job = (id: string, status: ProgressSnapshot['status'], percent = 0): ProgressSnapshot => ({
  id,
  status,
  percent,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the cursor ring', () => {
  it('never appears for a job that finishes quickly', async () => {
    const { surface, calls } = fake();
    const c = new LoaderController(surface, { enabled: () => true });
    c.update(job('a', 'running'));
    await vi.advanceTimersByTimeAsync(300);
    c.update(job('a', 'ok', 100));
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toEqual([]);
    expect(c.isVisible).toBe(false);
  });

  it('shows after a moment, follows the pointer, and hides when the job ends', async () => {
    const { surface, calls } = fake();
    const c = new LoaderController(surface, { enabled: () => true });
    c.update(job('a', 'running', 10));
    await vi.advanceTimersByTimeAsync(700);
    expect(c.isVisible).toBe(true);
    expect(calls).toContain('show');
    c.update(job('a', 'running', 60));
    expect(calls).toContain('push 60');
    c.update(job('a', 'ok', 100));
    expect(c.isVisible).toBe(false);
    expect(calls.at(-1)).toBe('hide');
    const follows = calls.filter((x) => x === 'follow').length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls.filter((x) => x === 'follow').length).toBe(follows); // it stopped following
  });

  it('does not get stuck when the job ends while the window is still being created', async () => {
    // The bug: the first time, making the window takes longer than a short conversion.
    const { surface, calls } = fake(400);
    const c = new LoaderController(surface, { enabled: () => true });
    c.update(job('a', 'running'));
    await vi.advanceTimersByTimeAsync(650); // the show timer fired; the window is being made
    c.update(job('a', 'ok', 100)); // the job finishes now
    await vi.advanceTimersByTimeAsync(2000);
    expect(c.isVisible).toBe(false);
    expect(calls).not.toContain('show');
  });

  it('does not let an old show complete after a newer burst has started and ended', async () => {
    const { surface, calls } = fake(400);
    const c = new LoaderController(surface, { enabled: () => true });
    c.update(job('a', 'running'));
    await vi.advanceTimersByTimeAsync(650);
    c.update(job('a', 'ok', 100));
    c.update(job('b', 'running'));
    await vi.advanceTimersByTimeAsync(2000); // b's own show is also in flight; it is still running
    expect(calls.filter((x) => x === 'show').length).toBeLessThanOrEqual(1);
    c.update(job('b', 'ok', 100));
    await vi.advanceTimersByTimeAsync(2000);
    expect(c.isVisible).toBe(false);
  });

  it('hides itself if the queue is idle although no final update arrived', async () => {
    const { surface } = fake();
    let busy = true;
    const c = new LoaderController(surface, { enabled: () => true, isBusy: () => busy });
    c.update(job('a', 'running'));
    await vi.advanceTimersByTimeAsync(700);
    expect(c.isVisible).toBe(true);
    busy = false; // the job's last message was lost
    await vi.advanceTimersByTimeAsync(2500);
    expect(c.isVisible).toBe(false);
  });

  it('stays hidden when the user turned the ring off', async () => {
    const { surface, calls } = fake();
    const c = new LoaderController(surface, { enabled: () => false });
    c.update(job('a', 'running'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toEqual([]);
  });
});
