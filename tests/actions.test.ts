import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  runAction,
  uniqueDestination,
  isInside,
  type ActionDeps,
} from '../src/main/services/actions';
import { folderFor, launchPlans } from '../src/main/services/terminal';
import { AppState } from '../src/main/services/state';
import { defaultSettings } from '../src/main/settings/schema';

const root = mkdtempSync(join(tmpdir(), 'convert-actions-'));
afterAll(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));

function deps(over: Partial<ActionDeps> = {}) {
  const notes: string[] = [];
  const recent: string[] = [];
  const d: ActionDeps = {
    getSettings: defaultSettings,
    pickFolder: async () => null,
    writeClipboard: vi.fn(),
    copyFilesToClipboard: vi.fn(async () => true),
    showItemInFolder: vi.fn(),
    openTerminal: vi.fn(async () => 'wt'),
    addToFloat: vi.fn(),
    recentFolders: { get: () => recent, add: (f) => void recent.unshift(f) },
    notify: (t) => void notes.push(t),
    ...over,
  };
  return { d, notes, recent };
}

describe('uniqueDestination / isInside', () => {
  it('numbers existing names', () => {
    const at = (name: string) => join('/o', name);
    const taken = new Set([at('a.txt'), at('a (1).txt')]);
    expect(uniqueDestination(at('a.txt'), (p) => taken.has(p))).toBe(at('a (2).txt'));
  });
  it('detects containment', () => {
    expect(isInside('/a/b', '/a/b/c')).toBe(true);
    expect(isInside('/a/b', '/a/bc')).toBe(false);
    expect(isInside('/a/b', '/a/b')).toBe(true);
  });
});

describe('actions', () => {
  it('copy-path joins several paths with newlines', async () => {
    const { d } = deps();
    await runAction('copy-path', ['C:\\a.png', 'C:\\b.png'], d);
    expect(d.writeClipboard).toHaveBeenCalledWith('C:\\a.png\nC:\\b.png');
  });
  it('copy keeps the source; move is the only action that removes it', async () => {
    const src = join(root, 'src.txt');
    const dest = join(root, 'dest');
    mkdirSync(dest);
    writeFileSync(src, 'data');
    const { d, recent } = deps({ pickFolder: async () => dest });
    await runAction('copy-to', [src], d);
    expect(existsSync(src)).toBe(true);
    expect(readFileSync(join(dest, 'src.txt'), 'utf8')).toBe('data');
    expect(recent[0]).toBe(dest);
    await runAction('copy-to', [src], d);
    expect(existsSync(join(dest, 'src (1).txt'))).toBe(true);
    await runAction('move', [src], d);
    expect(existsSync(src)).toBe(false);
    expect(existsSync(join(dest, 'src (2).txt'))).toBe(true);
    for (const id of ['copy', 'copy-path', 'reveal', 'terminal', 'float'] as const) {
      const s = join(root, `keep-${id}.txt`);
      writeFileSync(s, 'x');
      await runAction(id, [s], deps().d);
      expect(existsSync(s)).toBe(true);
    }
  });
  it('copy puts the files on the clipboard and reports a failure', async () => {
    const ok = deps();
    await runAction('copy', ['C:\\a.png', 'C:\\b.png'], ok.d);
    expect(ok.d.copyFilesToClipboard).toHaveBeenCalledWith(['C:\\a.png', 'C:\\b.png']);
    expect(ok.notes[0]).toMatch(/2 files copied/);
    const bad = deps({ copyFilesToClipboard: async () => false });
    await runAction('copy', ['C:\\a.png'], bad.d);
    expect(bad.notes[0]).toMatch(/went wrong/i);
  });
  it('does nothing when the folder picker is cancelled', async () => {
    const src = join(root, 'stay.txt');
    writeFileSync(src, 'x');
    await runAction('move', [src], deps().d);
    expect(existsSync(src)).toBe(true);
  });
  it('refuses to copy a folder into itself', async () => {
    const folder = join(root, 'tree');
    mkdirSync(join(folder, 'inner'), { recursive: true });
    const { d, notes } = deps({ pickFolder: async () => join(folder, 'inner') });
    await runAction('copy-to', [folder], d);
    expect(notes.join()).toMatch(/into itself/);
  });
  it('reports a failed terminal launch', async () => {
    const { d, notes } = deps({ openTerminal: async () => null });
    await runAction('terminal', ['C:\\a.png'], d);
    expect(notes).toHaveLength(1);
  });
});

describe('terminal plans', () => {
  it('passes a hostile folder as one argument and as cwd', () => {
    const folder = 'C:\\Users\\me\\a & b\\naïve "x"';
    const [wt] = launchPlans('wt', folder);
    expect(wt).toEqual({ file: 'wt.exe', args: ['-d', folder], cwd: folder });
  });
  it('tries the preferred shell first and falls back to the others', () => {
    expect(launchPlans('cmd', 'C:\\x').map((p) => p.file)).toEqual([
      'cmd.exe',
      'wt.exe',
      'powershell.exe',
    ]);
  });
  it('uses the parent folder for files', () => {
    expect(folderFor('/a/b/c.txt', () => false)).toBe('/a/b');
    expect(folderFor('/a/b', () => true)).toBe('/a/b');
  });
});

describe('AppState', () => {
  it('persists first run and a bounded, de-duplicated recent list', () => {
    const dir = join(root, 'state');
    const s = new AppState(dir);
    expect(s.firstRunDone).toBe(false);
    s.setFirstRunDone(true);
    for (let i = 0; i < 12; i++) s.recentFolders.add(`/f${i}`);
    s.recentFolders.add('/f5');
    const again = new AppState(dir);
    expect(again.firstRunDone).toBe(true);
    expect(again.recentFolders.get()).toHaveLength(8);
    expect(again.recentFolders.get()[0]).toBe('/f5');
  });
  it('survives a corrupt file', () => {
    const dir = join(root, 'badstate');
    mkdirSync(dir);
    writeFileSync(join(dir, 'state.json'), '{nope');
    expect(new AppState(dir).firstRunDone).toBe(false);
  });
});
