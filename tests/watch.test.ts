import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WatchService, type WatchRule } from '../src/main/services/watch';

const root = mkdtempSync(join(tmpdir(), 'convert-watch-'));
afterAll(() => {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // Windows may still hold a file.
  }
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function make(rules: WatchRule[]) {
  const converted: string[] = [];
  const notes: string[] = [];
  const handlers: Record<string, (name: string) => void> = {};
  const closed: string[] = [];
  const errors: Record<string, () => void> = {};
  let starts = 0;
  const svc = new WatchService({
    convert: (target, file) => converted.push(`${target}:${file}`),
    flags: () => ({ office: false, heic: false }),
    notify: (t) => void notes.push(t),
    retryMs: 30,
    watch: (folder, onName, onError) => {
      starts++;
      handlers[folder] = onName;
      errors[folder] = onError;
      return { close: () => void closed.push(folder) };
    },
    settleMs: 40,
  });
  svc.apply(rules);
  return { svc, converted, notes, handlers, closed, errors, starts: () => starts };
}

const rule = (folder: string, target = 'webp'): WatchRule => ({
  id: 'r1',
  folder,
  target,
  enabled: true,
});

describe('watch folders', () => {
  it('converts a new file once it has stopped growing, and only once', async () => {
    const { converted, handlers } = make([rule(root)]);
    const file = join(root, 'new.png');
    writeFileSync(file, 'a');
    handlers[root]?.('new.png');
    await wait(10);
    appendFileSync(file, 'bb'); // still being written
    handlers[root]?.('new.png');
    await wait(250);
    expect(converted).toEqual([`webp:${file}`]);
    handlers[root]?.('new.png'); // a repeated event for the same file and time
    await wait(150);
    expect(converted).toHaveLength(1);
  });

  it('ignores downloads in progress, hidden files, files already in the target format and other types', async () => {
    const { converted, handlers } = make([rule(root)]);
    for (const name of ['x.crdownload', '~convert-1', '.hidden.png', 'same.webp', 'song.mp3']) {
      writeFileSync(join(root, name), 'data');
      handlers[root]?.(name);
    }
    await wait(250);
    expect(converted).toEqual([]);
  });

  it('never converts results Convert wrote itself', async () => {
    const { svc, converted, handlers } = make([rule(root, 'png')]);
    const out = join(root, 'result.jpg');
    writeFileSync(out, 'jpegdata');
    svc.ignore([out]);
    handlers[root]?.('result.jpg');
    await wait(250);
    expect(converted).toEqual([]);
  });

  it('stops watching a rule that is removed or switched off, and refuses protected folders', () => {
    const a = make([rule(root)]);
    a.svc.apply([{ ...rule(root), enabled: false }]);
    expect(a.closed).toEqual([root]);
    const b = make([rule(process.platform === 'win32' ? 'C:\\Windows' : '/etc')]);
    expect(b.notes[0]).toContain('not allowed');
    expect(Object.keys(b.handlers)).toEqual([]);
  });

  it('does not restart a watcher whose rule has not changed', () => {
    const { svc, closed } = make([rule(root)]);
    svc.apply([rule(root)]);
    expect(closed).toEqual([]);
  });
});

describe('watch folders that go away', () => {
  it('starts watching again by itself after the watcher stops, without a message', async () => {
    const { svc, errors, starts, notes } = make([rule(root)]);
    expect(starts()).toBe(1);
    errors[root]?.(); // the folder was deleted or the drive was removed
    await wait(120);
    expect(starts()).toBe(2);
    expect(notes).toEqual([]);
    svc.stop();
  });

  it('keeps retrying a folder that cannot be watched yet, and stops when asked', async () => {
    let attempts = 0;
    const svc = new WatchService({
      convert: () => undefined,
      flags: () => ({ office: false, heic: false }),
      notify: () => undefined,
      retryMs: 20,
      watch: () => {
        attempts++;
        throw new Error('ENOENT');
      },
    });
    svc.apply([rule(root)]);
    await wait(150);
    expect(attempts).toBeGreaterThan(2);
    svc.stop();
    const seen = attempts;
    await wait(100);
    expect(attempts).toBe(seen);
  });
});
