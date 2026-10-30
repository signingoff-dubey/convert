import { describe, expect, it, vi } from 'vitest';
import { SHARE_TARGETS, sharesFor } from '../src/shared/formats';
import { defaultSettings } from '../src/main/settings/schema';
import { runShare, windowFinder, type ShareDeps } from '../src/main/services/share';
import { keycodeFor } from '../src/main/trigger/keymap';
import { matchWheel } from '../src/main/trigger/match';

const f = (path: string, isDirectory = false) => ({ path, isDirectory });

function deps(over: Partial<ShareDeps> = {}) {
  const opened: string[] = [];
  const notes: string[] = [];
  const d: ShareDeps = {
    copyFilesToClipboard: vi.fn(async () => true),
    hasApp: () => true,
    open: vi.fn(async (url: string) => void opened.push(url)),
    openWeb: () => false,
    findWebWindow: () => null,
    notify: (t) => void notes.push(t),
    ...over,
  };
  return { d, opened, notes };
}

describe('share wheel', () => {
  it('offers every app for files of any type, and nothing for folders only', () => {
    const r = sharesFor([f('a.png'), f('b.pdf')]);
    expect(r.status === 'ok' && r.items.map((t) => t.id)).toEqual(SHARE_TARGETS.map((t) => t.id));
    expect(sharesFor([f('d', true)])).toMatchObject({ status: 'disabled', reason: 'folder' });
    expect(sharesFor([])).toMatchObject({ status: 'disabled', reason: 'empty' });
    expect(sharesFor([f('d', true), f('a.txt')]).status).toBe('ok');
  });

  it('covers the requested apps and opens only fixed https or app addresses', () => {
    const ids = SHARE_TARGETS.map((t) => t.id);
    for (const id of ['claude', 'chatgpt', 'telegram', 'whatsapp']) expect(ids).toContain(id);
    expect(SHARE_TARGETS.length).toBeLessThanOrEqual(10);
    for (const t of SHARE_TARGETS) expect(t.web).toMatch(/^https:\/\//);
  });

  it('uses Shift+S by default and keeps it apart from the other wheels', () => {
    const triggers = defaultSettings().triggers;
    expect(triggers.share).toEqual({ modifiers: ['shift'], code: 'KeyS' });
    expect(
      matchWheel(triggers, keycodeFor('KeyS') as number, { shift: true, ctrl: false, alt: false }),
    ).toBe('share');
  });

  it('copies the files, then opens the installed app', async () => {
    const { d, opened, notes } = deps();
    await runShare('telegram', ['C:\\a.png', 'C:\\b.png'], d);
    expect(d.copyFilesToClipboard).toHaveBeenCalledWith(['C:\\a.png', 'C:\\b.png']);
    expect(opened).toEqual(['tg://']);
    expect(notes[0]).toBe('2 files copied. Press Ctrl+V in Telegram to attach.');
  });

  it('falls back to the website when the app is not installed', async () => {
    const { d, opened, notes } = deps({ hasApp: () => false });
    await runShare('claude', ['C:\\a.png'], d);
    expect(opened).toEqual(['https://claude.ai/new']);
    expect(notes[0]).toContain('opened in your browser');
  });

  it('prefers a browser window that already has the site open, and opens nothing new', async () => {
    const focus = vi.fn(() => true);
    const { d, opened, notes } = deps({ hasApp: () => false, findWebWindow: () => ({ focus }) });
    await runShare('whatsapp', ['C:\\a.png'], d);
    expect(focus).toHaveBeenCalled();
    expect(opened).toEqual([]);
    expect(notes[0]).toContain('browser window you already had open');
  });

  it('opens the site in the chosen browser when no window has it', async () => {
    const webOpened: string[] = [];
    const { d, opened } = deps({
      hasApp: () => false,
      openWeb: (url) => (webOpened.push(url), true),
    });
    await runShare('chatgpt', ['C:\\a.png'], d);
    expect(webOpened).toEqual(['https://chatgpt.com/']);
    expect(opened).toEqual([]);
  });

  it('uses the open window only if it can be brought forward', async () => {
    const { d, opened } = deps({
      hasApp: () => false,
      findWebWindow: () => ({ focus: () => false }),
    });
    await runShare('telegram', ['C:\\a.png'], d);
    expect(opened).toEqual(['https://web.telegram.org/']);
  });

  it('falls back to the website when the app refuses to open', async () => {
    const calls: string[] = [];
    const { d, notes } = deps({
      open: async (url) => {
        calls.push(url);
        if (url === 'whatsapp://') throw new Error('no handler');
      },
    });
    await runShare('whatsapp', ['C:\\a.png'], d);
    expect(calls).toEqual(['whatsapp://', 'https://web.whatsapp.com/']);
    expect(notes).toHaveLength(1);
  });

  it('opens nothing when the files cannot be copied, and ignores unknown apps', async () => {
    const { d, opened, notes } = deps({ copyFilesToClipboard: async () => false });
    await runShare('slack', ['C:\\a.png'], d);
    expect(opened).toEqual([]);
    expect(notes).toHaveLength(1);
    const again = deps();
    await runShare('evil', ['C:\\a.png'], again.d);
    expect(again.opened).toEqual([]);
  });
});

describe('finding an open web app', () => {
  const win = (titles: string[]) => ({
    available: true,
    windowClassAt: () => null,
    isKeyDown: () => false,
    visibleWindows: () => titles.map((title, i) => ({ title, handle: i })),
    focusWindow: (h: unknown) => h === 1,
  });
  const whatsapp = new RegExp(SHARE_TARGETS.find((t) => t.id === 'whatsapp')?.title ?? '', 'i');

  it('matches browser windows whose tab is the web app, and no other kind of window', () => {
    const find = windowFinder(
      win(['WhatsApp Setup', '(3) WhatsApp - Google Chrome', 'WhatsApp - Notes']),
    );
    // "WhatsApp Setup" and "WhatsApp - Notes" are not browser windows.
    expect(find(whatsapp)?.focus()).toBe(true);
    expect(windowFinder(win(['WhatsApp Setup', 'notes - WhatsApp']))(whatsapp)).toBeNull();
  });

  it('understands Edge and Firefox titles with a profile name', () => {
    const edge = windowFinder(
      win(['x', 'WhatsApp and 1 more page - Personal - Microsoft\u200b Edge']),
    );
    expect(edge(whatsapp)).not.toBeNull();
    const fox = windowFinder(win(['x', 'WhatsApp - Mozilla Firefox']));
    expect(fox(whatsapp)).not.toBeNull();
  });

  it('does not treat a page that merely mentions the app as the app', () => {
    const find = windowFinder(win(['How to use WhatsApp Web - Google Chrome']));
    expect(find(whatsapp)).toBeNull();
  });
});
