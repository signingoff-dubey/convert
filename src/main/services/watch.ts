import { watch as fsWatch, type FSWatcher } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { targetsFor } from '../../shared/formats';
import { checkDropPath } from '../jobs/paths';
import { logger } from './log';

const log = logger('watch');

export interface WatchRule {
  id: string;
  folder: string;
  target: string;
  enabled: boolean;
}

export interface WatchDeps {
  /** Starts the conversion. */
  convert(target: string, file: string): void;
  flags(): { office: boolean; heic: boolean };
  notify(text: string, kind?: 'info' | 'error'): void;
  /** Injected so tests do not depend on the operating system's watcher. */
  watch?: (folder: string, onName: (name: string) => void) => { close(): void };
  settleMs?: number;
}

/** Names that are work in progress: a download, a temporary file or Convert's own scratch folder. */
const IN_PROGRESS = /(^~|\.(crdownload|part|partial|tmp|temp|download|opdownload)$|^\.)/i;

function nativeWatch(folder: string, onName: (name: string) => void): { close(): void } {
  const w: FSWatcher = fsWatch(folder, { persistent: false }, (_event, name) => {
    if (name) onName(name.toString());
  });
  w.on('error', (error) => log.error(`watcher for ${folder} stopped`, error));
  return w;
}

/**
 * Converts every new file that lands in a watched folder. Files already there are left alone, a file is only
 * taken once its size has stopped changing (so a download in progress is not converted half finished), and
 * results Convert wrote itself are never converted again.
 */
export class WatchService {
  private watchers = new Map<string, { close(): void }>();
  private timers = new Map<string, NodeJS.Timeout>();
  private seen = new Set<string>();
  private own = new Set<string>();

  constructor(private readonly deps: WatchDeps) {}

  /** (Re)starts the watchers for the enabled rules. Safe to call on every settings change. */
  apply(rules: readonly WatchRule[]): void {
    const wanted = new Map(rules.filter((r) => r.enabled).map((r) => [r.id, r]));
    for (const [id, w] of this.watchers) {
      if (!wanted.has(id)) {
        w.close();
        this.watchers.delete(id);
      }
    }
    for (const rule of wanted.values()) {
      const key = `${rule.id}|${rule.folder}|${rule.target}`;
      if (this.watchers.has(rule.id) && this.keys.get(rule.id) === key) continue;
      this.watchers.get(rule.id)?.close();
      this.watchers.delete(rule.id);
      const check = checkDropPath(rule.folder);
      if (!check.ok) {
        this.deps.notify(`Watch folder skipped: ${rule.folder} is not allowed.`, 'error');
        continue;
      }
      try {
        const start = this.deps.watch ?? nativeWatch;
        this.watchers.set(
          rule.id,
          start(check.path, (name) => this.changed(rule, path.join(check.path, name))),
        );
        this.keys.set(rule.id, key);
      } catch (error) {
        log.error(`could not watch ${rule.folder}`, error);
        this.deps.notify(`Could not watch ${rule.folder}.`, 'error');
      }
    }
  }

  private keys = new Map<string, string>();

  /** Remember results Convert wrote, so a watched output folder does not feed itself. */
  ignore(files: readonly string[]): void {
    for (const f of files) this.own.add(path.resolve(f));
  }

  stop(): void {
    for (const w of this.watchers.values()) w.close();
    for (const t of this.timers.values()) clearTimeout(t);
    this.watchers.clear();
    this.timers.clear();
    this.keys.clear();
  }

  private changed(rule: WatchRule, file: string): void {
    if (IN_PROGRESS.test(path.basename(file))) return;
    clearTimeout(this.timers.get(file));
    // Wait for the events to stop, then for the size to stop changing.
    this.timers.set(
      file,
      setTimeout(() => void this.settle(rule, file, -1), this.deps.settleMs ?? 1200),
    );
  }

  private async settle(rule: WatchRule, file: string, lastSize: number): Promise<void> {
    this.timers.delete(file);
    let size: number;
    let mtime: number;
    try {
      const s = await stat(file);
      if (!s.isFile()) return;
      size = s.size;
      mtime = s.mtimeMs;
    } catch {
      return; // Gone again: a rename or a deleted temporary file.
    }
    if (size !== lastSize) {
      this.timers.set(
        file,
        setTimeout(() => void this.settle(rule, file, size), this.deps.settleMs ?? 1200),
      );
      return;
    }
    const key = `${file}|${mtime}`;
    if (this.seen.has(key) || this.own.has(path.resolve(file)) || size === 0) return;
    this.seen.add(key);
    if (this.seen.size > 5000) this.seen.clear();
    const { office, heic } = this.deps.flags();
    const offered = targetsFor([{ path: file, isDirectory: false }], {
      officeAvailable: office,
      heicEncoder: heic,
    });
    // Files that cannot become the target (wrong type, or already in that format) are simply ignored.
    if (offered.status !== 'ok' || !offered.items.some((t) => t.id === rule.target)) return;
    log.info(`watch: converting ${path.basename(file)} to ${rule.target}`);
    this.deps.convert(rule.target, file);
  }
}
