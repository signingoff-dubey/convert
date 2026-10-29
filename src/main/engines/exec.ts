import { spawn } from 'node:child_process';
import { JobError } from '../jobs/types';

export interface ExecOptions {
  signal?: AbortSignal;
  onStdoutLine?(line: string): void;
  onStderrLine?(line: string): void;
  cwd?: string;
}

export interface ExecResult {
  code: number;
  stderr: string;
}

function lines(onLine: ((line: string) => void) | undefined) {
  let buffer = '';
  return {
    push(chunk: Buffer): void {
      if (!onLine) return;
      buffer += chunk.toString('utf8');
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? '';
      for (const part of parts) onLine(part);
    },
  };
}

/**
 * Runs a bundled executable with an argument array. Never a shell string, so file names are never
 * interpolated into a command line (docs/02 section 8). Abort kills the child.
 */
export function execFileSafe(
  file: string,
  args: readonly string[],
  options: ExecOptions = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return reject(new JobError('E_CANCELLED'));
    const child = spawn(file, [...args], { cwd: options.cwd, windowsHide: true, shell: false });
    const out = lines(options.onStdoutLine);
    const err = lines(options.onStderrLine);
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString('utf8')).slice(-8000);
      err.push(d);
    });
    const onAbort = (): void => {
      child.kill();
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (error: NodeJS.ErrnoException) => {
      options.signal?.removeEventListener('abort', onAbort);
      reject(error.code === 'ENOENT' ? new JobError('E_ENGINE_MISSING', file) : error);
    });
    child.on('close', (code) => {
      options.signal?.removeEventListener('abort', onAbort);
      if (options.signal?.aborted) return reject(new JobError('E_CANCELLED'));
      resolve({ code: code ?? -1, stderr });
    });
  });
}
