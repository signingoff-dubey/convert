/**
 * Loads an ESM-only package from the CommonJS main bundle. The Function wrapper keeps the bundler
 * from rewriting import() into require(), which would fail for ESM-only packages. Under Vitest the
 * Function wrapper has no import callback, so a plain import() is used there.
 */
const importer = new Function('specifier', 'return import(specifier)') as (
  s: string,
) => Promise<unknown>;

export function dynamicImport<T>(specifier: string): Promise<T> {
  if (process.env.VITEST) return import(/* @vite-ignore */ specifier) as Promise<T>;
  return importer(specifier) as Promise<T>;
}
