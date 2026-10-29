import { win32 } from 'node:path';

export type PathCheck = { ok: true; path: string } | { ok: false; reason: PathRejection };
export type PathRejection =
  'empty' | 'null-byte' | 'device-prefix' | 'not-absolute' | 'protected-location';

const DEFAULT_PROTECTED = ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)'] as const;

function isUnder(path: string, root: string): boolean {
  const p = path.toLowerCase();
  const r = root.toLowerCase().replace(/\\+$/, '');
  return p === r || p.startsWith(`${r}\\`);
}

/**
 * Pure part of main-side drop validation (docs/02 section 6, step 4 and section 8).
 * Existence and file-type checks need the file system and live in the caller.
 */
export function checkDropPath(
  input: string,
  protectedRoots: readonly string[] = DEFAULT_PROTECTED,
): PathCheck {
  if (input.trim() === '') return { ok: false, reason: 'empty' };
  if (input.includes('\u0000')) return { ok: false, reason: 'null-byte' };
  // Device namespaces: \\.\ and \\?\ are rejected on input; Convert adds \\?\ itself later.
  if (input.startsWith('\\\\.\\') || input.startsWith('\\\\?\\')) {
    return { ok: false, reason: 'device-prefix' };
  }
  if (!/^[A-Za-z]:[\\/]/.test(input) && !/^\\\\[^\\]+\\[^\\]+/.test(input)) {
    return { ok: false, reason: 'not-absolute' };
  }
  const normalized = win32.normalize(input);
  if (protectedRoots.some((root) => isUnder(normalized, root))) {
    return { ok: false, reason: 'protected-location' };
  }
  return { ok: true, path: normalized };
}
