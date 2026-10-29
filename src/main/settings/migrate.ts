import { defaultSettings, Settings } from './schema';

export interface LoadResult {
  settings: Settings;
  /** Present when the stored file was unusable and must be kept as a backup. */
  backup?: { fileName: string; content: string };
}

/** Migration stub: schema version 1 is the only version, so nothing to upgrade yet. */
export function migrate(raw: unknown): unknown {
  return raw;
}

function backupName(now: Date): string {
  return `settings.bad-${now.toISOString().replace(/[:.]/g, '-')}.json`;
}

/**
 * Turns the stored text into valid settings. A missing file gives defaults silently;
 * a corrupt or invalid file is never deleted: it is returned as a backup and defaults load.
 */
export function recoverSettings(stored: string | null, now: Date): LoadResult {
  if (stored === null) return { settings: defaultSettings() };
  const bad = (): LoadResult => ({
    settings: defaultSettings(),
    backup: { fileName: backupName(now), content: stored },
  });
  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    return bad();
  }
  const parsed = Settings.safeParse(migrate(raw));
  return parsed.success ? { settings: parsed.data } : bad();
}
