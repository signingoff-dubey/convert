import type { Settings } from '../settings/schema';

export type ErrorCode =
  | 'E_UNSUPPORTED'
  | 'E_CORRUPT_INPUT'
  | 'E_ENGINE_MISSING'
  | 'E_DISK_FULL'
  | 'E_PERMISSION'
  | 'E_PATH_TOO_LONG'
  | 'E_ENCRYPTED_PDF'
  | 'E_WRONG_PASSWORD'
  | 'E_CANCELLED'
  | 'E_STALLED'
  | 'E_UNKNOWN';

export class JobError extends Error {
  constructor(
    readonly code: ErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
  }
}

export type Params = Record<string, string | number | boolean>;

/** What a job writes. 'none' is for operations that only report (never used by engines today). */
export type OutputKind =
  | { type: 'file'; ext: string; suffix?: string }
  /** Several results, moved straight into the original's folder. */
  | { type: 'dir'; suffix?: string }
  /**
   * Several results kept together in a folder named after the original. With `collapseSingle`, an
   * archive that holds just one top-level item is not wrapped in a folder.
   */
  | { type: 'folder'; suffix?: string; collapseSingle?: boolean }
  /** Nothing is written: the text the engine produces goes to the clipboard. */
  | { type: 'clipboard' };

export interface Operation {
  /** Wedge or tool id, such as 'png', 'compress', 'trim'. */
  id: string;
  kind: 'convert' | 'tool';
  params?: Params;
}

export interface RunContext {
  /** Collision-resolved temporary path in the output folder, with the final extension. */
  tempPath: string;
  /** For dir outputs: a fresh temporary directory in the output folder. */
  tempDir: string;
  /**
   * For multi-file results (page images, split PDFs, extracted archives): write them here. They are moved
   * straight into the original's folder afterwards, never into a new folder.
   */
  outDir: string;
  signal: AbortSignal;
  onProgress(percent: number): void;
  settings: Settings;
  /** Extra inputs for multi-file operations such as merge. */
  allInputs: readonly string[];
  officePath: string | null;
}

export interface RunResult {
  /** Set when nothing was written because the result would not be smaller. */
  note?: 'already-compact';
  /** Something the conversion could not carry over, shown to the user with the result. */
  warning?: string;
}

export interface Engine {
  id: string;
  canHandle(op: Operation, inputPath: string): boolean;
  run(op: Operation, inputPath: string, ctx: RunContext): Promise<unknown>;
}

export type JobStatus = 'queued' | 'running' | 'ok' | 'error' | 'cancelled';

export interface JobResult {
  jobId: string;
  batchId: string;
  input: string;
  output?: string;
  /** Every file or folder a job created, in the original's folder. `output` is the first. */
  outputs?: string[];
  status: Exclude<JobStatus, 'queued' | 'running'>;
  note?: 'already-compact' | 'text-copied';
  warning?: string;
  error?: { code: ErrorCode; message: string };
}
