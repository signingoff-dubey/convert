import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../services/log';
import { recoverSettings } from './migrate';
import { Settings, defaultSettings } from './schema';

const log = logger('settings');
const DEBOUNCE_MS = 300;

type Listener = (settings: Settings) => void;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep merge for settings patches. Arrays and primitives replace; objects merge. */
export function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return out;
}

export class SettingsService {
  private current: Settings = defaultSettings();
  private listeners = new Set<Listener>();
  private timer: NodeJS.Timeout | null = null;
  private readonly file: string;

  constructor(private readonly dir: string) {
    this.file = join(dir, 'settings.json');
  }

  load(): Settings {
    mkdirSync(this.dir, { recursive: true });
    let stored: string | null = null;
    try {
      stored = readFileSync(this.file, 'utf8');
    } catch {
      // First run, or unreadable: defaults.
    }
    const result = recoverSettings(stored, new Date());
    if (result.backup) {
      // Never delete a bad file: keep it beside the settings before defaults overwrite it.
      writeFileSync(join(this.dir, result.backup.fileName), result.backup.content);
      log.error(`settings file was invalid; backed up as ${result.backup.fileName}`);
    }
    this.current = result.settings;
    if (stored === null || result.backup) this.writeNow();
    return this.current;
  }

  get(): Settings {
    return this.current;
  }

  /** Validates the merged result in main before accepting it; throws on invalid input. */
  update(patch: unknown): Settings {
    const next = Settings.parse(deepMerge(this.current, patch));
    this.replace(next);
    return next;
  }

  replace(next: Settings): void {
    this.current = next;
    this.scheduleWrite();
    for (const listener of this.listeners) listener(next);
  }

  /** Backs up the current file, then restores defaults. */
  reset(): Settings {
    this.flush();
    try {
      const text = readFileSync(this.file, 'utf8');
      writeFileSync(join(this.dir, `settings.bad-reset-${Date.now()}.json`), text);
    } catch {
      // Nothing to back up.
    }
    const next = defaultSettings();
    this.replace(next);
    return next;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.writeNow();
    }
  }

  private scheduleWrite(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.writeNow();
    }, DEBOUNCE_MS);
  }

  /** Atomic: write a temp file, then rename over the real one. */
  private writeNow(): void {
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.current, null, 2));
      renameSync(tmp, this.file);
    } catch (error) {
      log.error('could not write settings', error);
    }
  }
}
