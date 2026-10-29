import { app } from 'electron';
import { logger } from './log';

const log = logger('autostart');

/**
 * Start with Windows via the per-user Run key. Registered only after onboarding has finished, and only
 * in a packaged build so a development run never registers electron.exe.
 */
export function applyAutostart(startWithWindows: boolean, firstRunDone: boolean): void {
  if (!app.isPackaged || process.platform !== 'win32') return;
  const open = startWithWindows && firstRunDone;
  app.setLoginItemSettings({ openAtLogin: open, path: process.execPath, args: ['--hidden'] });
  log.info(`start with Windows: ${open}`);
}
