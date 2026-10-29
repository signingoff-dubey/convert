import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { categoryOf } from '../../shared/formats';
import { JobError, type Engine } from '../jobs/types';
import { unpacked } from './binaries';
import { open } from './image';
import { nodeRequire } from './req';

/** Longest side handed to the recognizer; larger pictures are reduced, smaller ones enlarged to this floor. */
const MAX_SIDE = 4200;
const MIN_SIDE = 1400;
/** A page shorter than this is read in one piece; splitting it would not save time. */
const SPLIT_MIN_HEIGHT = 900;

interface Worker {
  id: string;
  terminate(): Promise<unknown>;
}
interface Scheduler {
  addWorker(w: Worker): string;
  addJob(action: 'recognize', image: Buffer): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
}

let pool: Promise<Scheduler> | null = null;

export function ocrWorkerCount(): number {
  const forced = Number(process.env['CONVERT_OCR_WORKERS']);
  if (Number.isInteger(forced) && forced >= 1 && forced <= 8) return forced;
  return Math.max(1, Math.min(4, cpus().length - 1));
}

/**
 * Several recognizers run side by side on one scheduler. They are created together on first use and kept.
 * Language data is bundled, never downloaded.
 */
function scheduler(cacheDir: string): Promise<Scheduler> {
  pool ??= (async () => {
    const t = nodeRequire('tesseract.js') as {
      createWorker(lang: string, oem: number, options: Record<string, unknown>): Promise<Worker>;
      createScheduler(): Scheduler;
    };
    const langPath = unpacked(
      join(dirname(nodeRequire.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int'),
    );
    const s = t.createScheduler();
    const workers = await Promise.all(
      Array.from({ length: ocrWorkerCount() }, () =>
        t.createWorker('eng', 1, {
          langPath,
          gzip: true,
          cachePath: cacheDir,
          logger: () => undefined,
        }),
      ),
    );
    for (const w of workers) s.addWorker(w);
    return s;
  })();
  pool.catch(() => (pool = null));
  return pool;
}

export async function shutdownOcr(): Promise<void> {
  if (!pool) return;
  const s = await pool.catch(() => null);
  pool = null;
  await s?.terminate().catch(() => undefined);
}

/**
 * Cut points (row numbers) that fall inside fully blank stretches, so no line of text is ever split.
 * Aims for about two bands per worker so a slow band does not leave the others idle.
 */
export function bandCuts(blank: readonly boolean[], workers: number): number[] {
  const h = blank.length;
  if (workers < 2 || h < SPLIT_MIN_HEIGHT) return [];
  const target = Math.max(350, Math.ceil(h / (workers * 2)));
  const minGap = Math.max(5, Math.round(h / 400));
  const cuts: number[] = [];
  let last = 0;
  let y = 0;
  while (y < h) {
    if (!blank[y]) {
      y++;
      continue;
    }
    let end = y;
    while (end < h && blank[end]) end++;
    const mid = Math.floor((y + end) / 2);
    if (end - y >= minGap && mid - last >= target && h - mid >= target / 2) {
      cuts.push(mid);
      last = mid;
    }
    y = end;
  }
  return cuts;
}

/** True for rows with (almost) no ink, judged against the page's own background. */
function blankRows(grey: Buffer, width: number, height: number): boolean[] {
  const rows: boolean[] = new Array<boolean>(height);
  const allowed = Math.max(1, Math.floor(width / 500));
  for (let y = 0; y < height; y++) {
    const base = y * width;
    // Page is normalised to a light background, so anything clearly darker is ink.
    let ink = 0;
    for (let x = 0; x < width && ink <= allowed; x++) if ((grey[base + x] as number) < 150) ink++;
    rows[y] = ink <= allowed;
  }
  return rows;
}

/** Tidies recognizer output: no trailing spaces, at most one empty line in a row. */
export function tidyText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface OcrOptions {
  cacheDir: string;
  signal: AbortSignal;
  onProgress?(percent: number): void;
}

/** Reads the text in an image (already oriented), using every worker at once. */
export async function ocrImage(image: Sharp, opts: OcrOptions): Promise<string> {
  const { data, info } = await image
    .flatten({ background: '#ffffff' })
    .greyscale()
    .normalise()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let { width, height } = info;
  let grey = data;
  const longest = Math.max(width, height);
  const factor =
    longest < MIN_SIDE ? MIN_SIDE / longest : longest > MAX_SIDE ? MAX_SIDE / longest : 1;
  if (Math.abs(factor - 1) > 0.01) {
    const resized = await sharp(grey, { raw: { width, height, channels: 1 } })
      .resize(Math.round(width * factor), Math.round(height * factor), { kernel: 'lanczos3' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    grey = resized.data;
    width = resized.info.width;
    height = resized.info.height;
  }
  const cuts = bandCuts(blankRows(grey, width, height), ocrWorkerCount());
  const edges = [0, ...cuts, height];
  const raw = { raw: { width, height, channels: 1 as const } };
  const s = await scheduler(opts.cacheDir).catch((error: unknown) => {
    throw new JobError('E_ENGINE_MISSING', error instanceof Error ? error.message : 'OCR engine');
  });
  let done = 0;
  const parts = await Promise.all(
    edges.slice(0, -1).map(async (top, i) => {
      if (opts.signal.aborted) throw new JobError('E_CANCELLED');
      const bottom = edges[i + 1] as number;
      const png = await sharp(grey, raw)
        .extract({ left: 0, top, width, height: bottom - top })
        .extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#ffffff' })
        .png({ compressionLevel: 1 })
        .toBuffer();
      if (opts.signal.aborted) throw new JobError('E_CANCELLED');
      const result = await s.addJob('recognize', png);
      opts.onProgress?.(Math.round((++done / (edges.length - 1)) * 100));
      return result.data.text;
    }),
  );
  return tidyText(parts.join('\n'));
}

export function userCacheDir(): string {
  return join(
    process.env['CONVERT_OCR_CACHE'] ?? process.env['TEMP'] ?? process.env['TMPDIR'] ?? '/tmp',
    'convert-ocr',
  );
}

/** Image to TXT: the text found in the picture, read in parallel. */
export const ocrEngine: Engine = {
  id: 'ocr',
  canHandle: (op, input) =>
    op.kind === 'convert' && op.id === 'txt' && categoryOf(input) === 'image',
  async run(_op, input, ctx) {
    const { writeFile } = await import('node:fs/promises');
    const picture = (await open(input)).rotate();
    const text = await ocrImage(picture, {
      cacheDir: userCacheDir(),
      signal: ctx.signal,
      onProgress: ctx.onProgress,
    });
    if (text === '')
      throw new JobError('E_UNSUPPORTED', 'no readable text was found in this picture');
    await writeFile(ctx.tempPath, text + '\n', 'utf8');
  },
};
