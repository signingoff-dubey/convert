import { existsSync } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { app, shell } from 'electron';
import { logger } from './log';

const log = logger('sendto');

/** The formats offered in Explorer's Send to menu. Each one is a shortcut that runs Convert with --convert. */
export const SEND_TO_TARGETS = [
  { id: 'pdf', label: 'PDF' },
  { id: 'png', label: 'PNG' },
  { id: 'jpg', label: 'JPG' },
  { id: 'webp', label: 'WebP' },
  { id: 'mp3', label: 'MP3' },
  { id: 'mp4', label: 'MP4' },
  { id: 'txt', label: 'text (TXT)' },
] as const;

export function sendToName(label: string): string {
  return `Convert to ${label}.lnk`;
}

function folder(): string {
  return path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'SendTo');
}

/**
 * Adds or removes the Send to shortcuts. Only in an installed build on Windows, so a development run never
 * leaves shortcuts that point at electron.exe.
 */
export async function applySendTo(on: boolean): Promise<void> {
  if (!app.isPackaged || process.platform !== 'win32') return;
  const dir = folder();
  try {
    if (on) {
      await mkdir(dir, { recursive: true });
      for (const t of SEND_TO_TARGETS) {
        shell.writeShortcutLink(path.join(dir, sendToName(t.label)), 'create', {
          target: process.execPath,
          args: `--convert ${t.id}`,
          description: `Convert the selected files to ${t.label}`,
          icon: process.execPath,
          iconIndex: 0,
        });
      }
    } else {
      for (const t of SEND_TO_TARGETS) {
        const file = path.join(dir, sendToName(t.label));
        if (existsSync(file)) await unlink(file);
      }
    }
    log.info(`Send to menu: ${on}`);
  } catch (error) {
    log.error('could not update the Send to menu', error);
  }
}
