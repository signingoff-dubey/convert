import { posix, win32 } from 'node:path';

export type PathCheck = { ok: true; path: string } | { ok: false; reason: PathRejection };
export type PathRejection =
  'empty' | 'null-byte' | 'device-prefix' | 'not-absolute' | 'protected-location';

export type PathStyle = 'win32' | 'posix';

const WIN_PROTECTED = ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)'] as const;
const POSIX_PROTECTED = [
  '/etc',
  '/usr',
  '/bin',
  '/sbin',
  '/boot',
  '/proc',
  '/sys',
  '/dev',
  '/lib',
] as const;

function isUnder(path: string, root: string, style: PathStyle): boolean {
  const fold = (s: string): string => (style === 'win32' ? s.toLowerCase() : s);
  const sep = style === 'win32' ? '\\' : '/';
  const p = fold(path);
  const r = fold(root).replace(/[\\/]+$/, '');
  return p === r || p.startsWith(`${r}${sep}`);
}

/**
 * Pure part of main-side drop validation (docs/02 section 6, step 4 and section 8).
 * Existence and file-type checks need the file system and live in the caller.
 * `style` is win32 in the shipped app; the posix style exists so development on other systems works.
 */
export function checkDropPath(
  input: string,
  protectedRoots?: readonly string[],
  style: PathStyle = process.platform === 'win32' ? 'win32' : 'posix',
): PathCheck {
  if (input.trim() === '') return { ok: false, reason: 'empty' };
  if (input.includes('\u0000')) return { ok: false, reason: 'null-byte' };
  // Device namespaces: \\.\ and \\?\ are rejected on input; Convert adds \\?\ itself later.
  if (input.startsWith('\\\\.\\') || input.startsWith('\\\\?\\')) {
    return { ok: false, reason: 'device-prefix' };
  }
  const absolute =
    style === 'win32'
      ? /^[A-Za-z]:[\\/]/.test(input) || /^\\\\[^\\]+\\[^\\]+/.test(input)
      : input.startsWith('/');
  if (!absolute) return { ok: false, reason: 'not-absolute' };
  const normalized = style === 'win32' ? win32.normalize(input) : posix.normalize(input);
  const roots = protectedRoots ?? (style === 'win32' ? WIN_PROTECTED : POSIX_PROTECTED);
  if (roots.some((root) => isUnder(normalized, root, style))) {
    return { ok: false, reason: 'protected-location' };
  }
  return { ok: true, path: normalized };
}
