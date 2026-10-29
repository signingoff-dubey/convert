/**
 * Folds the progress of every job in the current burst of activity into one number for the cursor loader.
 * The burst ends, and the totals reset, when nothing is queued or running any more.
 */
export interface ProgressSnapshot {
  id: string;
  status: 'queued' | 'running' | 'ok' | 'error' | 'cancelled';
  percent: number;
}

export interface Progress {
  active: boolean;
  /** 0 to 100, averaged over all jobs in the burst; finished jobs count as 100. */
  percent: number;
  /** No job has reported any progress yet, so only a spinner is honest. */
  indeterminate: boolean;
  /** Jobs still queued or running. */
  count: number;
}

export class ProgressTracker {
  private jobs = new Map<string, { status: ProgressSnapshot['status']; percent: number }>();

  update(snap: ProgressSnapshot): Progress {
    this.jobs.set(snap.id, { status: snap.status, percent: snap.percent });
    const state = this.state();
    if (!state.active) this.jobs.clear();
    return state;
  }

  state(): Progress {
    const all = [...this.jobs.values()];
    const live = all.filter((j) => j.status === 'queued' || j.status === 'running');
    if (live.length === 0) return { active: false, percent: 100, indeterminate: false, count: 0 };
    const total = all.reduce(
      (sum, j) => sum + (j.status === 'queued' || j.status === 'running' ? j.percent : 100),
      0,
    );
    const reported =
      all.some((j) => j.percent > 0 && (j.status === 'running' || j.status === 'queued')) ||
      live.length < all.length;
    return {
      active: true,
      percent: Math.round(total / all.length),
      indeterminate: !reported,
      count: live.length,
    };
  }
}
