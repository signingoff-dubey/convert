import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nodeRequire } from './req';

/**
 * Loads an ESM-only package from the CommonJS main bundle. The Function wrapper keeps the bundler
 * from rewriting import() into require(), which would fail for ESM-only packages. Under Vitest the
 * Function wrapper has no import callback, so a plain import() is used there.
 */
const importer = new Function('specifier', 'return import(specifier)') as (
  s: string,
) => Promise<unknown>;

interface PackageJson {
  exports?: unknown;
  module?: string;
  main?: string;
}

/** The file an `import` of the package root would load: exports, then module, then main. */
function packageEntry(pkg: PackageJson): string {
  const root = (pkg.exports as Record<string, unknown> | undefined)?.['.'] ?? pkg.exports;
  const pick = (v: unknown): string | null => {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      for (const key of ['import', 'node', 'default']) {
        const found = key in o ? pick(o[key]) : null;
        if (found) return found;
      }
    }
    return null;
  };
  return pick(root) ?? pkg.module ?? pkg.main ?? 'index.js';
}

/**
 * Turns "marked" or "pdfjs-dist/legacy/build/pdf.mjs" into an absolute file URL. A bare name would only
 * resolve while the app runs from the project folder; inside an installed app it must be a full URL.
 */
export function esmUrl(specifier: string): string {
  const parts = specifier.split('/');
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] as string);
  const subpath = parts.slice(name.split('/').length).join('/');
  const manifest = nodeRequire.resolve(`${name}/package.json`);
  const root = dirname(manifest);
  const file = subpath
    ? join(root, subpath)
    : join(root, packageEntry(JSON.parse(readFileSync(manifest, 'utf8')) as PackageJson));
  return pathToFileURL(file).href;
}

export function dynamicImport<T>(specifier: string): Promise<T> {
  if (process.env.VITEST) return import(/* @vite-ignore */ specifier) as Promise<T>;
  return importer(esmUrl(specifier)) as Promise<T>;
}
