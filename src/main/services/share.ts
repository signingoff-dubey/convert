import { SHARE_TARGETS, type ShareTarget } from '../../shared/formats';
import { STRINGS } from '../../shared/strings';
import type { Win32 } from '../native/win32';
import { logger } from './log';

const log = logger('share');

export interface ShareDeps {
  /** Puts the files themselves on the clipboard, ready to paste into a chat. */
  copyFilesToClipboard(paths: string[]): Promise<boolean>;
  /** True when a desktop app is registered for this address, such as tg:// for Telegram. */
  hasApp(protocol: string): boolean;
  /** Opens an address in the app or browser registered for it. */
  open(url: string): Promise<void>;
  /** Opens a web address in the browser the user chose; false when that browser is not available. */
  openWeb(url: string): boolean;
  /** Finds a browser window that already has this web app open and can bring it to the front. */
  findWebWindow(titlePattern: RegExp): { focus(): boolean } | null;
  notify(text: string, kind?: 'info' | 'error'): void;
}

export function shareTarget(id: string): ShareTarget | undefined {
  return SHARE_TARGETS.find((t) => t.id === id);
}

/**
 * Hands files to an app: the files go on the clipboard, then the app opens (the website if the desktop app
 * is not installed) and the user pastes them with Ctrl+V. Only the fixed addresses in SHARE_TARGETS are opened.
 */
export async function runShare(id: string, paths: string[], deps: ShareDeps): Promise<void> {
  const target = shareTarget(id);
  if (!target || paths.length === 0) return;
  if (!(await deps.copyFilesToClipboard(paths))) {
    deps.notify(STRINGS.errors.E_UNKNOWN, 'error');
    return;
  }
  let via: 'app' | 'window' | 'browser' = 'app';
  if (deps.hasApp(target.protocol)) {
    try {
      await deps.open(target.protocol);
    } catch (error) {
      log.error(`could not open ${target.id}`, error);
      via = 'browser';
    }
  } else via = 'window';
  if (via === 'window') {
    // No desktop app: use a browser window that already has the web app open, if there is one.
    const open = deps.findWebWindow(new RegExp(target.title, 'i'));
    if (!(open && open.focus())) via = 'browser';
  }
  if (via === 'browser') {
    try {
      if (!deps.openWeb(target.web)) await deps.open(target.web);
    } catch (error) {
      log.error(`could not open ${target.web}`, error);
      deps.notify(STRINGS.toast.shareFailed(target.label), 'error');
      return;
    }
  }
  deps.notify(STRINGS.toast.shared(paths.length, target.label, via));
}

/** Browser windows show "<page title> - <browser name>"; this keeps matches to those and never to other apps. */
const BROWSER_TITLE =
  /^(?<page>.*?)(?: - [^-]+?)? - (Google Chrome|Microsoft.? Edge|Brave|Mozilla Firefox|Firefox|Opera|Vivaldi|Chromium)$/;

/** Looks through open window titles for a browser tab showing the web app. Reads titles only, never page data. */
export function windowFinder(win32: Win32): ShareDeps['findWebWindow'] {
  return (pattern) => {
    for (const w of win32.visibleWindows()) {
      const page = BROWSER_TITLE.exec(w.title)?.groups?.['page'];
      if (page !== undefined && pattern.test(page))
        return { focus: () => win32.focusWindow(w.handle) };
    }
    return null;
  };
}
