import { cp, lstat, mkdir, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { STRINGS } from '../../shared/strings';
import type { Settings } from '../settings/schema';
import { logger } from './log';

const log = logger('actions');

export type ActionId = 'copy' | 'copy-to' | 'move' | 'copy-path' | 'terminal' | 'float' | 'reveal';

/** Electron-facing operations, injected so the logic can be tested without Electron. */
export interface ActionDeps {
  getSettings(): Settings;
  pickFolder(defaultPath: string | undefined): Promise<string | null>;
  writeClipboard(text: string): void;
  /** Puts the files themselves on the clipboard, ready to paste in Explorer. */
  copyFilesToClipboard(paths: string[]): Promise<boolean>;
  showItemInFolder(path: string): void;
  openTerminal(shell: Settings['output']['preferredShell'], path: string): Promise<unknown>;
  addToFloat(paths: string[]): void;
  recentFolders: { get(): string[]; add(folder: string): void };
  notify(text: string, kind?: 'info' | 'error'): void;
  exists?(path: string): boolean;
}

/** `name (1).ext`, `name (2).ext`, ... Never returns an existing path. */
export function uniqueDestination(
  dest: string,
  exists: (p: string) => boolean = existsSync,
): string {
  const { dir, name, ext } = path.parse(dest);
  for (let n = 0; ; n++) {
    const candidate = n === 0 ? dest : path.join(dir, `${name} (${n})${ext}`);
    if (!exists(candidate)) return candidate;
  }
}

/** True when `child` is `parent` or lies inside it. Used to refuse copying a folder into itself. */
export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function transfer(
  src: string,
  destDir: string,
  move: boolean,
  exists: (p: string) => boolean,
): Promise<string> {
  const dest = uniqueDestination(path.join(destDir, path.basename(src)), exists);
  const st = await lstat(src);
  if (st.isDirectory() && isInside(src, dest)) throw new Error('cannot copy a folder into itself');
  if (move) {
    try {
      await rename(src, dest);
      return dest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    }
  }
  await cp(src, dest, { recursive: true, errorOnExist: true, force: false });
  // Move only removes the source after the copy fully succeeded.
  if (move) await rm(src, { recursive: true });
  return dest;
}

export async function runAction(id: ActionId, paths: string[], deps: ActionDeps): Promise<void> {
  const exists = deps.exists ?? existsSync;
  const first = paths[0];
  if (first === undefined) return;
  switch (id) {
    case 'copy-path':
      deps.writeClipboard(paths.join('\n'));
      deps.notify(STRINGS.toast.copied(paths.length));
      return;
    case 'reveal':
      deps.showItemInFolder(first);
      return;
    case 'terminal': {
      const opened = await deps.openTerminal(deps.getSettings().output.preferredShell, first);
      if (!opened) deps.notify(STRINGS.errors.E_UNKNOWN, 'error');
      return;
    }
    case 'copy':
      if (await deps.copyFilesToClipboard(paths))
        deps.notify(STRINGS.toast.copiedToClipboard(paths.length));
      else deps.notify(STRINGS.errors.E_UNKNOWN, 'error');
      return;
    case 'float':
      deps.addToFloat(paths);
      deps.notify(STRINGS.toast.floated(paths.length));
      return;
    case 'copy-to':
    case 'move': {
      const recent = deps.recentFolders.get()[0];
      const folder = await deps.pickFolder(recent);
      if (!folder) return;
      await mkdir(folder, { recursive: true });
      let done = 0;
      for (const src of paths) {
        try {
          await transfer(src, folder, id === 'move', exists);
          done++;
        } catch (error) {
          log.error(`${id} failed`, error);
          deps.notify(
            `${path.basename(src)}: ${error instanceof Error ? error.message : String(error)}`,
            'error',
          );
        }
      }
      deps.recentFolders.add(folder);
      if (done > 0) {
        const where = path.basename(folder) || folder;
        deps.notify(
          id === 'move' ? STRINGS.toast.movedTo(done, where) : STRINGS.toast.copiedTo(done, where),
        );
      }
      return;
    }
  }
}
