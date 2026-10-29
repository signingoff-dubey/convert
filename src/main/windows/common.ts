import { join } from 'node:path';
import { BrowserWindow, shell, type BrowserWindowConstructorOptions } from 'electron';
import type { Settings } from '../settings/schema';
import { resolveTheme, THEMES } from '../../renderer/theme/themes';

export type PageName = 'overlay' | 'settings' | 'toast' | 'toolwin' | 'float' | 'loader';

const CSP =
  "default-src 'self'; img-src 'self' data: convert-file:; style-src 'self' 'unsafe-inline'; media-src convert-file:; connect-src 'none'";

/** Dev server URL from electron-vite, or null in a packaged build. */
export function devUrl(): string | null {
  return process.env.ELECTRON_RENDERER_URL ?? null;
}

export function isTrustedUrl(url: string): boolean {
  const dev = devUrl();
  return url.startsWith('file://') || (dev !== null && url.startsWith(dev));
}

/** One sandboxed preload for every window; it reads its page name from the launch arguments. */
export function preloadPath(): string {
  return join(__dirname, '../preload/index.js');
}

/** Background colour that matches the theme so there is no flash before the first paint. */
export function backgroundFor(settings: Settings, prefersDark: boolean): string {
  return THEMES[resolveTheme(settings.appearance.theme, prefersDark)].bg;
}

export function secureWebPreferences(page: PageName): Electron.WebPreferences {
  return {
    preload: preloadPath(),
    additionalArguments: [`--convert-page=${page}`],
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    spellcheck: false,
  };
}

/** Applies CSP, blocks navigation and window.open (docs/02 section 8), then loads the page. */
export async function loadPage(win: BrowserWindow, page: PageName): Promise<void> {
  const contents = win.webContents;
  contents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] },
    });
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/github\.com\/signingoff-dubey\/convert/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event) => event.preventDefault());
  const dev = devUrl();
  if (dev) await win.loadURL(`${dev}/${page}.html`);
  else await win.loadFile(join(__dirname, `../renderer/${page}.html`));
}

export function createWindow(
  options: BrowserWindowConstructorOptions,
  page: PageName,
): BrowserWindow {
  return new BrowserWindow({
    ...options,
    webPreferences: secureWebPreferences(page),
  });
}
