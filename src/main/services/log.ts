import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type LogLevel = 'error' | 'info' | 'debug';
const RANK: Record<LogLevel, number> = { error: 0, info: 1, debug: 2 };
const MAX_BYTES = 2 * 1024 * 1024;

let dir: string | null = null;
let level: LogLevel = 'info';

export function initLog(logDir: string, initial: LogLevel): void {
  dir = logDir;
  level = initial;
  mkdirSync(dir, { recursive: true });
}

export function setLogLevel(next: LogLevel): void {
  level = next;
}

export function logDir(): string | null {
  return dir;
}

function write(lvl: LogLevel, scope: string, message: string, extra?: unknown): void {
  if (RANK[lvl] > RANK[level]) return;
  const detail = extra instanceof Error ? `${extra.message}\n${extra.stack ?? ''}` : extra;
  const line = `${new Date().toISOString()} ${lvl.toUpperCase()} [${scope}] ${message}${
    detail === undefined ? '' : ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
  }\n`;
  if (dir === null) {
    process.stderr.write(line);
    return;
  }
  const file = join(dir, 'convert.log');
  try {
    if (statSync(file).size > MAX_BYTES) renameSync(file, join(dir, 'convert.old.log'));
  } catch {
    // No log file yet.
  }
  try {
    appendFileSync(file, line);
  } catch {
    process.stderr.write(line);
  }
}

/** Never pass key codes or key content here, except the matched combos at debug level. */
export function logger(scope: string) {
  return {
    error: (message: string, extra?: unknown) => write('error', scope, message, extra),
    info: (message: string, extra?: unknown) => write('info', scope, message, extra),
    debug: (message: string, extra?: unknown) => write('debug', scope, message, extra),
  };
}
