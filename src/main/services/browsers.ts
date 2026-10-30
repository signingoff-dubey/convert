import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type BrowserChoice = 'default' | 'chrome' | 'edge' | 'firefox' | 'brave';

/** Where each browser installs itself, per machine and per user. */
export function browserPaths(
  choice: Exclude<BrowserChoice, 'default'>,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const roots = [env['ProgramFiles'], env['ProgramFiles(x86)'], env['LOCALAPPDATA']].filter(
    (r): r is string => !!r,
  );
  const rel: Record<typeof choice, string> = {
    chrome: join('Google', 'Chrome', 'Application', 'chrome.exe'),
    edge: join('Microsoft', 'Edge', 'Application', 'msedge.exe'),
    firefox: join('Mozilla Firefox', 'firefox.exe'),
    brave: join('BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
  };
  return roots.map((r) => join(r, rel[choice]));
}

/**
 * Opens a web address in the chosen browser (the one the user is signed in to), or returns false when it is
 * not installed so the caller can use the default browser. The address is passed as one argument, never
 * through a shell.
 */
export function openInBrowser(url: string, choice: BrowserChoice): boolean {
  if (choice === 'default') return false;
  const exe = browserPaths(choice).find((p) => existsSync(p));
  if (!exe) return false;
  spawn(exe, [url], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  return true;
}
