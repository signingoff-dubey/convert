import { describe, expect, it } from 'vitest';
import { placeBadge } from '../src/main/overlay/geometry';
import { ProgressTracker, type ProgressSnapshot } from '../src/main/jobs/progress';

const snap = (id: string, status: ProgressSnapshot['status'], percent = 0): ProgressSnapshot => ({
  id,
  status,
  percent,
});

describe('ProgressTracker', () => {
  it('is inactive with no jobs and spins until something reports progress', () => {
    const t = new ProgressTracker();
    expect(t.state().active).toBe(false);
    const s = t.update(snap('a', 'running', 0));
    expect(s).toMatchObject({ active: true, percent: 0, indeterminate: true, count: 1 });
    expect(t.update(snap('a', 'running', 40))).toMatchObject({ percent: 40, indeterminate: false });
  });
  it('averages a batch, counting finished jobs as complete', () => {
    const t = new ProgressTracker();
    t.update(snap('a', 'running', 50));
    t.update(snap('b', 'queued', 0));
    expect(t.state()).toMatchObject({ percent: 25, count: 2 });
    t.update(snap('a', 'ok', 100));
    expect(t.state()).toMatchObject({ percent: 50, count: 1, indeterminate: false });
  });
  it('goes inactive and forgets the burst when everything has finished', () => {
    const t = new ProgressTracker();
    t.update(snap('a', 'running', 80));
    expect(t.update(snap('a', 'ok', 100)).active).toBe(false);
    // A new burst starts from zero, not from the old average.
    expect(t.update(snap('c', 'running', 10))).toMatchObject({ percent: 10, count: 1 });
  });
  it('treats errors and cancels as finished', () => {
    const t = new ProgressTracker();
    t.update(snap('a', 'running', 10));
    expect(t.update(snap('a', 'error', 10)).active).toBe(false);
    t.update(snap('b', 'running', 10));
    expect(t.update(snap('b', 'cancelled', 10)).active).toBe(false);
  });
});

describe('placeBadge', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  it('sits below and to the right of the pointer', () => {
    expect(placeBadge({ x: 500, y: 400 }, 56, area)).toEqual({ x: 518, y: 422 });
  });
  it('flips to the left and above near the right and bottom edges', () => {
    const p = placeBadge({ x: 1910, y: 1030 }, 56, area);
    expect(p.x + 56).toBeLessThanOrEqual(1910);
    expect(p.y + 56).toBeLessThanOrEqual(1030);
  });
  it('stays on the screen at the corners and on a second monitor', () => {
    for (const c of [
      { x: 0, y: 0 },
      { x: 1919, y: 0 },
      { x: 0, y: 1039 },
      { x: 1919, y: 1039 },
    ]) {
      const p = placeBadge(c, 56, area);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + 56).toBeLessThanOrEqual(1920);
      expect(p.y + 56).toBeLessThanOrEqual(1040);
    }
    const second = { x: 1920, y: 0, width: 1280, height: 1024 };
    expect(placeBadge({ x: 2000, y: 100 }, 56, second).x).toBeGreaterThanOrEqual(1920);
  });
});
