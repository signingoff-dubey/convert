import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { cpus, tmpdir } from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  unlink,
} from 'node:fs/promises';
import type { Settings } from '../settings/schema';
import { logger } from '../services/log';
import { NamingError, resolveOutput, resolveOutputDir, uniqueSibling } from './naming';
import { isMultiInput, planOutput, selectEngine } from './operations';
import {
  JobError,
  type ErrorCode,
  type JobResult,
  type Operation,
  type OutputKind,
  type Params,
  type RunResult,
} from './types';

const log = logger('jobs');
const STALL_MS = 120_000;
const UNDO_WINDOW_MS = 12_000;

/** Snapshot sent to the toast window. */
export interface JobSnapshot {
  id: string;
  batchId: string;
  inputName: string;
  opId: string;
  opKind: 'convert' | 'tool';
  status: 'queued' | 'running' | 'ok' | 'error' | 'cancelled';
  percent: number;
  stalled: boolean;
  outputName?: string;
  /** Folder the result is in, which is the original's folder unless a custom folder is set. */
  outputDir?: string;
  /** How many files or folders were created. */
  outputCount?: number;
  note?: 'already-compact' | 'text-copied';
  warning?: string;
  /** For Copy text: how many characters went to the clipboard. */
  copiedChars?: number;
  error?: { code: ErrorCode; message: string };
  undoable: boolean;
}

interface Job {
  id: string;
  batchId: string;
  op: Operation;
  input: string;
  allInputs: string[];
  status: JobSnapshot['status'];
  percent: number;
  stalled: boolean;
  controller: AbortController;
  output?: string;
  outputs?: string[];
  note?: 'already-compact' | 'text-copied';
  warning?: string;
  copiedChars?: number;
  error?: { code: ErrorCode; message: string };
  finishedAt?: number;
  stallTimer?: NodeJS.Timeout;
}

export interface QueueDeps {
  getSettings(): Settings;
  getOfficePath(): string | null;
  /** Sends a file to the Recycle Bin. Only called when the user enabled that option. */
  trash(path: string): Promise<void>;
  exists?(path: string): boolean;
  /** Puts text on the clipboard. Only Copy text uses it. */
  copyText?(text: string): void;
}

export function toJobError(error: unknown): { code: ErrorCode; message: string } {
  if (error instanceof JobError) return { code: error.code, message: error.message };
  if (error instanceof NamingError) return { code: 'E_PATH_TOO_LONG', message: error.message };
  const message = error instanceof Error ? error.message : String(error);
  const errno = (error as NodeJS.ErrnoException | undefined)?.code;
  if (errno === 'ENOSPC') return { code: 'E_DISK_FULL', message };
  if (errno === 'EACCES' || errno === 'EPERM') return { code: 'E_PERMISSION', message };
  if (errno === 'ENAMETOOLONG') return { code: 'E_PATH_TOO_LONG', message };
  return { code: 'E_UNKNOWN', message };
}

/** Moves temp output into place without ever overwriting: a hard link fails if the name is taken. */
async function moveNoClobber(
  from: string,
  to: string,
  isDir: boolean,
  exists: (p: string) => boolean,
) {
  if (exists(to)) throw Object.assign(new Error('destination exists'), { code: 'EEXIST' });
  if (isDir) return rename(from, to);
  try {
    await link(from, to);
    await unlink(from);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') throw error;
    // Hard links are not available on every file system; the existence check above is the fallback.
    await rename(from, to);
  }
}

export class JobQueue extends EventEmitter {
  private jobs = new Map<string, Job>();
  private waiting: Job[] = [];
  private active = 0;
  private readonly limit = cpus().length >= 8 ? 3 : 2;
  private readonly exists: (p: string) => boolean;

  constructor(private readonly deps: QueueDeps) {
    super();
    this.exists = deps.exists ?? existsSync;
  }

  /** A multi-file drop becomes N jobs under one batch id, except operations that need the whole set. */
  enqueue(op: Operation, paths: readonly string[]): { batchId: string; jobIds: string[] } {
    const batchId = randomUUID();
    const inputs = isMultiInput(op, paths) ? [[...paths]] : paths.map((p) => [p]);
    const ids = inputs.map((group) => {
      const job: Job = {
        id: randomUUID(),
        batchId,
        op,
        input: group[0] as string,
        allInputs: group,
        status: 'queued',
        percent: 0,
        stalled: false,
        controller: new AbortController(),
      };
      this.jobs.set(job.id, job);
      this.waiting.push(job);
      this.publish(job);
      return job.id;
    });
    this.pump();
    return { batchId, jobIds: ids };
  }

  cancel(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.status === 'queued') {
      this.waiting = this.waiting.filter((j) => j !== job);
      this.finish(job, 'cancelled');
      return;
    }
    if (job.status === 'running') job.controller.abort();
  }

  /** Deletes what the job created, never its source. Allowed for a short window after completion. */
  async undo(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    const created = job?.outputs ?? [];
    if (!job || job.status !== 'ok' || created.length === 0) return false;
    if (Date.now() - (job.finishedAt ?? 0) > UNDO_WINDOW_MS) return false;
    const overlapsSource = created.some((output) => {
      const target = path.resolve(output);
      return job.allInputs.some((p) => {
        const src = path.resolve(p);
        return src === target || src.startsWith(target + path.sep);
      });
    });
    if (overlapsSource) {
      log.error('refusing to undo: an output overlaps a source', { jobId });
      return false;
    }
    for (const output of created) await rm(output, { recursive: true, force: true });
    job.output = undefined;
    job.outputs = undefined;
    this.publish(job);
    return true;
  }

  outputOf(jobId: string): string | undefined {
    return this.jobs.get(jobId)?.output;
  }

  /** Waits until every job in the queue has finished. Used by tests. */
  async idle(): Promise<void> {
    while (this.active > 0 || this.waiting.length > 0) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  resultOf(jobId: string): JobResult | undefined {
    const j = this.jobs.get(jobId);
    if (!j || j.status === 'queued' || j.status === 'running') return undefined;
    return {
      jobId: j.id,
      batchId: j.batchId,
      input: j.input,
      output: j.output,
      outputs: j.outputs,
      status: j.status,
      note: j.note,
      warning: j.warning,
      error: j.error,
    };
  }

  private pump(): void {
    while (this.active < this.limit) {
      const job = this.waiting.shift();
      if (!job) return;
      this.active++;
      void this.run(job).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private async run(job: Job): Promise<void> {
    job.status = 'running';
    this.publish(job);
    const bump = (): void => {
      job.stalled = false;
      clearTimeout(job.stallTimer);
      job.stallTimer = setTimeout(() => {
        job.stalled = true;
        this.publish(job);
      }, STALL_MS);
    };
    bump();
    let tempDir: string | null = null;
    try {
      const settings = this.deps.getSettings();
      const st = await lstat(job.input).catch(() => null);
      if (!st) throw new JobError('E_UNSUPPORTED', 'source file is missing');
      if (job.op.id === 'copy-text') {
        await this.copyText(job, settings, bump);
        return this.finish(job, 'ok');
      }
      const engine = selectEngine(job.op, job.input);
      const planned: OutputKind = planOutput(job.op, job.input);
      if (planned.type === 'clipboard') throw new JobError('E_UNSUPPORTED', 'nothing to save');
      const plan = planned;
      const naming = settings.output;
      // Several files into one ZIP: name it after their folder, so Trip\\a.jpg and Trip\\b.jpg become Trip.zip.
      const nameSource =
        job.op.id === 'zip' && job.allInputs.length > 1
          ? path.join(path.dirname(job.input), path.basename(path.dirname(job.input)) || 'Archive')
          : job.input;
      const finalPath =
        plan.type === 'dir' || plan.type === 'folder'
          ? resolveOutputDir(job.input, naming, this.exists, plan.suffix ?? '', path)
          : resolveOutput(nameSource, plan.ext, naming, this.exists, plan.suffix ?? '', path);
      const parent = path.dirname(finalPath);
      await mkdir(parent, { recursive: true });
      tempDir = path.join(parent, `~convert-${job.id.slice(0, 8)}`);
      await mkdir(tempDir, { recursive: true });
      const outDir = path.join(tempDir, 'out');
      await mkdir(outDir, { recursive: true });
      const tempPath = path.join(tempDir, `out.${plan.type === 'file' ? plan.ext : 'tmp'}`);

      const result = await engine.run(job.op, job.input, {
        tempPath,
        tempDir,
        outDir,
        signal: job.controller.signal,
        onProgress: (pct) => {
          job.percent = Math.max(job.percent, Math.min(99, pct));
          bump();
          this.publish(job);
        },
        settings,
        allInputs: job.allInputs,
        officePath: this.deps.getOfficePath(),
      });
      if (job.controller.signal.aborted) throw new JobError('E_CANCELLED');

      job.warning = (result as RunResult | undefined)?.warning;
      if ((result as RunResult | undefined)?.note === 'already-compact') {
        job.note = 'already-compact';
        return this.finish(job, 'ok');
      }
      if (plan.type === 'dir') {
        // Several files: they go straight into the original's folder, not into a new folder.
        job.outputs = await this.scatter(outDir, parent);
      } else if (plan.type === 'folder') {
        const entries = (await readdir(outDir)).filter((n) => !n.startsWith('.'));
        if (entries.length === 0)
          throw new JobError('E_UNKNOWN', 'the converter produced no files');
        if (plan.collapseSingle && entries.length === 1) {
          // One item inside the archive: put it beside the archive instead of wrapping it in a folder.
          job.outputs = await this.scatter(outDir, parent);
        } else {
          await moveNoClobber(outDir, finalPath, true, this.exists);
          job.outputs = [finalPath];
        }
      } else {
        await moveNoClobber(tempPath, finalPath, false, this.exists);
        job.outputs = [finalPath];
      }
      job.output = job.outputs[0];
      job.percent = 100;
      if (settings.output.recycleOriginal) {
        await this.deps
          .trash(job.input)
          .catch((e: unknown) => log.error('could not recycle original', e));
      }
      this.finish(job, 'ok');
    } catch (error) {
      if (
        job.controller.signal.aborted ||
        (error instanceof JobError && error.code === 'E_CANCELLED')
      ) {
        this.finish(job, 'cancelled');
      } else {
        job.error = toJobError(error);
        log.error(`job failed: ${job.op.id} ${job.error.code}`, error);
        this.finish(job, 'error');
      }
    } finally {
      clearTimeout(job.stallTimer);
      if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Reads the text of every file (pictures by OCR) and puts it on the clipboard instead of writing a file. */
  private async copyText(job: Job, settings: Settings, bump: () => void): Promise<void> {
    if (!this.deps.copyText) throw new JobError('E_UNKNOWN', 'no clipboard');
    const dir = await mkdtemp(path.join(tmpdir(), 'convert-text-'));
    const op: Operation = { id: 'txt', kind: 'convert' };
    const texts: string[] = [];
    let firstError: unknown;
    try {
      const total = job.allInputs.length;
      for (const [i, file] of job.allInputs.entries()) {
        if (job.controller.signal.aborted) throw new JobError('E_CANCELLED');
        const tempPath = path.join(dir, `t${i}.txt`);
        try {
          await selectEngine(op, file).run(op, file, {
            tempPath,
            tempDir: dir,
            outDir: dir,
            signal: job.controller.signal,
            onProgress: (pct) => {
              job.percent = Math.max(
                job.percent,
                Math.min(99, Math.round(((i + pct / 100) / total) * 100)),
              );
              bump();
              this.publish(job);
            },
            settings,
            allInputs: [file],
            officePath: this.deps.getOfficePath(),
          });
          const text = (await readFile(tempPath, 'utf8')).replace(/\s+$/, '');
          texts.push(total > 1 ? `${path.basename(file)}\n${text}` : text);
        } catch (error) {
          if (job.controller.signal.aborted) throw error;
          firstError ??= error;
        }
      }
      if (texts.length === 0) throw firstError ?? new JobError('E_UNSUPPORTED', 'no text found');
      const text = texts.join('\n\n');
      this.deps.copyText(text);
      job.copiedChars = text.length;
      job.note = 'text-copied';
      job.percent = 100;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Moves every result into the target folder under a name that does not exist yet, removing partial work on failure. */
  private async scatter(outDir: string, targetDir: string): Promise<string[]> {
    const names = (await readdir(outDir)).filter((n) => !n.startsWith('.')).sort();
    if (names.length === 0) throw new JobError('E_UNKNOWN', 'the converter produced no files');
    const created: string[] = [];
    try {
      for (const name of names) {
        const from = path.join(outDir, name);
        const isDir = (await lstat(from)).isDirectory();
        const dest = uniqueSibling(path.join(targetDir, name), this.exists, path);
        await moveNoClobber(from, dest, isDir, this.exists);
        created.push(dest);
      }
    } catch (error) {
      for (const done of created)
        await rm(done, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
    return created;
  }

  private finish(job: Job, status: 'ok' | 'error' | 'cancelled'): void {
    job.status = status;
    job.finishedAt = Date.now();
    clearTimeout(job.stallTimer);
    this.publish(job);
    const result = this.resultOf(job.id);
    if (result) this.emit('done', result);
  }

  private publish(job: Job): void {
    this.emit('update', this.snapshot(job));
  }

  snapshot(job: Job): JobSnapshot {
    return {
      id: job.id,
      batchId: job.batchId,
      inputName: path.basename(job.input),
      opId: job.op.id,
      opKind: job.op.kind,
      status: job.status,
      percent: job.percent,
      stalled: job.stalled,
      outputName: job.output ? path.basename(job.output) : undefined,
      outputDir: job.output ? path.dirname(job.output) : undefined,
      outputCount: job.outputs?.length,
      note: job.note,
      warning: job.warning,
      copiedChars: job.copiedChars,
      error: job.error,
      undoable: job.status === 'ok' && (job.outputs?.length ?? 0) > 0,
    };
  }
}

export type { Params };
