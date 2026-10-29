import { createRequire } from 'node:module';

/**
 * `require` that works both in the CommonJS main bundle and when the same files run under Vitest (ESM).
 * Native and CommonJS-only engines are loaded lazily through it, so idle RAM stays low.
 */
export const nodeRequire: NodeJS.Require =
  typeof require === 'function' ? require : createRequire(import.meta.url);
