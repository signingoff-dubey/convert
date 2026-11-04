import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { lstat, rm } from 'node:fs/promises';
import path from 'node:path';
import { logger } from './log';

const log = logger('temp');

/** Convert's own scratch folders look like "~convert-1a2b3c4d". Nothing else is ever removed. */
const SCRATCH = /^~convert-[0-9a-f]{8}$/;

/**
 * Remembers the scratch folders of running jobs, so that if Convert is killed or the PC loses power mid-job the
 * leftovers (which sit beside the user's files) are removed the next time it starts.
 */
export class TempTracker {
  private dirs = new Set<string>();

  constructor(private readonly file: string) {
    try {
      const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
      if (Array.isArray(raw))
        this.dirs = new Set(raw.filter((p): p is string => typeof p === 'string'));
    } catch {
      // No record yet.
    }
  }

  add(dir: string): void {
    this.dirs.add(dir);
    this.save();
  }

  remove(dir: string): void {
    if (this.dirs.delete(dir)) this.save();
  }

  /** Deletes recorded scratch folders that are still there. Returns how many were removed. */
  async sweep(): Promise<number> {
    let removed = 0;
    for (const dir of [...this.dirs]) {
      try {
        if (
          SCRATCH.test(path.basename(dir)) &&
          existsSync(dir) &&
          (await lstat(dir)).isDirectory()
        ) {
          await rm(dir, { recursive: true, force: true });
          removed++;
        }
      } catch (error) {
        log.error(`could not remove ${dir}`, error);
        continue; // Keep it recorded and try again next start.
      }
      this.dirs.delete(dir);
    }
    this.save();
    if (removed > 0) log.info(`removed ${removed} leftover scratch folder(s)`);
    return removed;
  }

  private save(): void {
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify([...this.dirs]));
      renameSync(tmp, this.file);
    } catch {
      // The record is a convenience; losing it only means a leftover folder stays.
    }
  }
}
