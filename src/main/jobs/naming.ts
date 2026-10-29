import { win32 } from 'node:path';

type PlatformPath = typeof win32;
import { STRINGS } from '../../shared/strings';

export interface NamingSettings {
  location: 'nextToSource' | 'custom';
  customFolder: string | null;
  useConvertedSubfolder: boolean;
}

export class NamingError extends Error {
  readonly code = 'E_PATH_TOO_LONG';
  constructor() {
    super(STRINGS.errors.pathTooLong);
  }
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;
const MAX_PATH = 259;
const MAX_EXTENDED = 32767;

/** Makes one file-name component safe on Windows. Never returns an empty string. */
export function sanitizeName(name: string): string {
  let out = name.replace(ILLEGAL, '_').replace(/[. ]+$/, '');
  if (out === '') out = 'file';
  // Reserved device names are reserved with or without an extension (CON, CON.txt).
  const stem = out.split('.')[0] ?? out;
  if (RESERVED.test(stem.trimEnd())) out = `_${out}`;
  return out;
}

/** Converts a long path to the extended-length form; leaves short or already-prefixed paths alone. */
export function toExtendedPath(path: string): string {
  if (path.startsWith('\\\\?\\') || path.length <= MAX_PATH) return path;
  if (path.length > MAX_EXTENDED) throw new NamingError();
  if (path.startsWith('\\\\')) return `\\\\?\\UNC\\${path.slice(2)}`;
  return `\\\\?\\${path}`;
}

function outputFolder(srcDir: string, settings: NamingSettings, api: PlatformPath): string {
  if (settings.location === 'custom' && settings.customFolder) return settings.customFolder;
  return settings.useConvertedSubfolder ? api.join(srcDir, 'Converted') : srcDir;
}

function samePath(a: string, b: string, api: PlatformPath): boolean {
  const [x, y] = [api.normalize(a), api.normalize(b)];
  // Windows paths are case-insensitive; the posix `api` exists only so tests can run elsewhere.
  return api === win32 ? x.toLowerCase() === y.toLowerCase() : x === y;
}

function finalize(path: string, api: PlatformPath): string {
  return api === win32 ? toExtendedPath(path) : path;
}

/**
 * Picks the output path for converting `srcPath` to `newExt`. Never returns an existing path
 * and never returns the source path itself. `existsFn` receives the path that will actually be used.
 * `api` is win32 in the app; tests on other systems pass the platform's own path module.
 */
export function resolveOutput(
  srcPath: string,
  newExt: string,
  settings: NamingSettings,
  existsFn: (path: string) => boolean,
  suffix = '',
  api: PlatformPath = win32,
): string {
  const { dir, name } = api.parse(srcPath);
  const folder = outputFolder(dir, settings, api);
  const base = sanitizeName(name) + suffix;
  const ext = newExt.replace(/^\./, '').toLowerCase();
  for (let n = 0; ; n++) {
    const file = n === 0 ? `${base}.${ext}` : `${base} (${n}).${ext}`;
    const candidate = api.join(folder, file);
    if (samePath(candidate, srcPath, api)) continue;
    const final = finalize(candidate, api);
    if (!existsFn(final)) return final;
  }
}

/** Folder output for multi-file results such as PDF to PNG: `name\`, then `name (1)\`, and so on. */
export function resolveOutputDir(
  srcPath: string,
  settings: NamingSettings,
  existsFn: (path: string) => boolean,
  suffix = '',
  api: PlatformPath = win32,
): string {
  const { dir, name } = api.parse(srcPath);
  const folder = outputFolder(dir, settings, api);
  // photos.tar.gz becomes the folder "photos", not "photos.tar".
  const base = sanitizeName(name.replace(/\.tar$/i, '')) + suffix;
  for (let n = 0; ; n++) {
    const candidate = api.join(folder, n === 0 ? base : `${base} (${n})`);
    const final = finalize(candidate, api);
    if (!existsFn(final)) return final;
  }
}

/** `name (1).ext`, `name (2).ext`, ... for a path that must not collide with anything that already exists. */
export function uniqueSibling(
  dest: string,
  existsFn: (path: string) => boolean,
  api: PlatformPath = win32,
): string {
  const { dir, name, ext } = api.parse(dest);
  for (let n = 0; ; n++) {
    const candidate = n === 0 ? dest : api.join(dir, `${name} (${n})${ext}`);
    if (!existsFn(finalize(candidate, api))) return finalize(candidate, api);
  }
}

/** `name-001.png` style page file names. */
export function pageFileName(base: string, page: number, ext: string, pages: number): string {
  const width = Math.max(3, String(pages).length);
  return `${sanitizeName(base)}-${String(page).padStart(width, '0')}.${ext.toLowerCase()}`;
}
