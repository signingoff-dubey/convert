import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { dispatchWedge, validateDropped, type DispatchDeps } from '../src/main/dispatch';

vi.mock('electron', () => ({ net: {}, protocol: {} }));

const root = mkdtempSync(join(tmpdir(), 'convert-dispatch-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function deps(over: Partial<DispatchDeps> = {}) {
  const enqueue = vi.fn();
  const show = vi.fn();
  const notify = vi.fn();
  const runAction = vi.fn();
  const d = {
    queue: { enqueue },
    toolwin: { show },
    actions: {
      getSettings: () => ({ output: { preferredShell: 'cmd' } }),
      pickFolder: async () => null,
      writeClipboard: runAction,
      copyFilesToClipboard: async () => true,
      showItemInFolder: vi.fn(),
      openTerminal: vi.fn(),
      addToFloat: vi.fn(),
      recentFolders: { get: () => [], add: vi.fn() },
      notify,
    },
    flags: () => ({ office: false, heic: false }),
    notify,
    ...over,
  } as unknown as DispatchDeps;
  return { d, enqueue, show, notify, runAction };
}

describe('validateDropped', () => {
  it('keeps real absolute files and folders, drops the rest and de-duplicates', async () => {
    const file = join(root, 'a.png');
    const dir = join(root, 'folder');
    writeFileSync(file, 'x');
    mkdirSync(dir);
    const r = await validateDropped([
      file,
      file,
      dir,
      join(root, 'missing.png'),
      '..\\x',
      '\\\\.\\C:',
      '',
    ]);
    expect(r.items.map((i) => i.isDirectory)).toEqual([false, true]);
    expect(r.skipped).toBe(5);
  });
  it('follows a link to a folder', async () => {
    const dir = join(root, 'real');
    mkdirSync(dir);
    const link = join(root, 'link');
    try {
      symlinkSync(dir, link, 'dir');
    } catch {
      return; // no symlink permission on this machine
    }
    expect((await validateDropped([link])).items[0]?.isDirectory).toBe(true);
  });
});

describe('dispatchWedge', () => {
  const png = join(root, 'p.png');
  writeFileSync(png, 'x');

  it('queues a conversion that the real files allow', async () => {
    const { d, enqueue } = deps();
    await dispatchWedge(d, 'convert', 'jpg', [png]);
    expect(enqueue).toHaveBeenCalledWith({ id: 'jpg', kind: 'convert' }, [png]);
  });
  it('refuses a wedge the real selection does not offer, including hidden ones', async () => {
    const a = deps();
    await dispatchWedge(a.d, 'convert', 'png', [png]); // own format
    await dispatchWedge(a.d, 'convert', 'heic', [png]); // no encoder
    await dispatchWedge(a.d, 'convert', 'mp3', [png]); // wrong category
    expect(a.enqueue).not.toHaveBeenCalled();
    expect(a.notify).toHaveBeenCalledTimes(3);
    const b = deps({ flags: () => ({ office: false, heic: true }) } as Partial<DispatchDeps>);
    await dispatchWedge(b.d, 'convert', 'heic', [png]);
    expect(b.enqueue).toHaveBeenCalled();
  });
  it('sends a mixed batch to one format and skips what is already in it', async () => {
    const jpg = join(root, 'q.jpg');
    writeFileSync(jpg, 'x');
    const { d, enqueue, notify } = deps();
    await dispatchWedge(d, 'convert', 'jpg', [png, jpg]);
    expect(enqueue).toHaveBeenCalledWith({ id: 'jpg', kind: 'convert' }, [png]);
    expect(notify).toHaveBeenCalledWith(
      'Skipped 1 file that is already JPG or cannot become it',
      'info',
    );
  });
  it('says so when every file is already in the chosen format', async () => {
    const jpg = join(root, 'r.jpg');
    const jpg2 = join(root, 'r2.jpg');
    writeFileSync(jpg, 'x');
    writeFileSync(jpg2, 'x');
    const { d, enqueue, notify } = deps();
    await dispatchWedge(d, 'convert', 'png', [jpg, jpg2]);
    expect(enqueue).toHaveBeenCalledWith({ id: 'png', kind: 'convert' }, [jpg, jpg2]);
    notify.mockClear();
    enqueue.mockClear();
    await dispatchWedge(d, 'convert', 'jpg', [jpg, jpg2]);
    expect(enqueue).not.toHaveBeenCalled();
  });
  it('opens a window for editor tools and queues plain ones', async () => {
    const { d, show, enqueue } = deps();
    await dispatchWedge(d, 'tools', 'crop', [png]);
    expect(show).toHaveBeenCalledWith('crop', [png]);
    const mp3 = join(root, 's.mp3');
    writeFileSync(mp3, 'x');
    await dispatchWedge(d, 'tools', 'normalize', [mp3]);
    expect(enqueue).toHaveBeenCalledWith({ id: 'normalize', kind: 'tool' }, [mp3]);
  });
  it('does not offer Collage for a single image', async () => {
    const { d, show, notify } = deps();
    await dispatchWedge(d, 'tools', 'collage', [png]);
    expect(show).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalled();
  });
  it('runs actions on folders and mixed selections', async () => {
    const { d, runAction } = deps();
    await dispatchWedge(d, 'actions', 'copy-path', [png, root]);
    expect(runAction).toHaveBeenCalledWith(`${png}\n${root}`);
  });
  it('reports when nothing dropped is a file on disk', async () => {
    const { d, notify, enqueue } = deps();
    await dispatchWedge(d, 'convert', 'jpg', ['\\\\.\\PhysicalDrive0']);
    expect(enqueue).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("This item isn't a file on disk.", 'error');
  });
});
