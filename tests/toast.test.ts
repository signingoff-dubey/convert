import { describe, expect, it } from 'vitest';
import type { JobSnapshot } from '../src/main/jobs/queue';
import { buildToast } from '../src/main/windows/toast-window';

const snap = (over: Partial<JobSnapshot>): JobSnapshot => ({
  id: 'j1',
  batchId: 'b1',
  inputName: 'photo.heic',
  opId: 'png',
  opKind: 'convert',
  status: 'ok',
  percent: 100,
  stalled: false,
  outputName: 'photo.png',
  undoable: true,
  ...over,
});

describe('buildToast', () => {
  it('words a single conversion as from to', () => {
    const t = buildToast([snap({})], 6);
    expect(t.kind).toBe('success');
    expect(t.title).toBe('Converted photo.heic → photo.png');
    expect(t.canUndo && t.canReveal).toBe(true);
  });
  it('says exactly which folder the result is in', () => {
    const t = buildToast([snap({ outputDir: 'D:\\Photos\\Trip', outputCount: 1 })], 6);
    expect(t.detail).toBe('Saved in D:\\Photos\\Trip');
    const many = buildToast([snap({ outputDir: 'D:\\Docs', outputCount: 12 })], 6);
    expect(many.detail).toBe('12 files saved in D:\\Docs');
  });
  it('folds a batch into one toast', () => {
    expect(buildToast([snap({ id: 'a' }), snap({ id: 'b' })], 6).title).toBe('Converted 2 files');
  });
  it('shows averaged progress and a cancel button while running', () => {
    const t = buildToast(
      [
        snap({ id: 'a', status: 'running', percent: 40 }),
        snap({ id: 'b', status: 'queued', percent: 0 }),
      ],
      6,
    );
    expect(t).toMatchObject({ kind: 'progress', percent: 20, canCancel: true, canUndo: false });
  });
  it('flags stalled jobs', () => {
    const t = buildToast([snap({ status: 'running', percent: 10, stalled: true })], 6);
    expect(t.stalled).toBe(true);
    expect(t.detail).toMatch(/no progress/);
  });
  it('explains errors with a short sentence, not a stack', () => {
    const t = buildToast(
      [snap({ status: 'error', error: { code: 'E_ENCRYPTED_PDF', message: 'x' } })],
      6,
    );
    expect(t.kind).toBe('error');
    expect(t.detail).toMatch(/password/i);
  });
  it('reports already compact without offering undo', () => {
    const t = buildToast(
      [
        snap({
          opKind: 'tool',
          opId: 'compress',
          note: 'already-compact',
          outputName: undefined,
          undoable: false,
        }),
      ],
      6,
    );
    expect(t.title).toMatch(/Already compact/);
    expect(t.canUndo).toBe(false);
    expect(t.canReveal).toBe(false);
  });
  it('words tools with their label', () => {
    expect(buildToast([snap({ opKind: 'tool', opId: 'rotate' })], 6).title).toBe(
      'Rotated photo.heic',
    );
  });
});
