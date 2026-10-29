import { nodeRequire } from './req';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { extensionOf } from '../../shared/formats';
import { pageFileName } from '../jobs/naming';
import {
  JobError,
  type Engine,
  type Operation,
  type RunContext,
  type RunResult,
} from '../jobs/types';
import { dynamicImport } from './esm';

const CONVERT = new Set(['png', 'jpg', 'txt', 'md']);
const TOOLS = new Set(['compress', 'split', 'merge']);
const DPI = 300;

/**
 * Parses "1-3, 5, 7-" into zero-based page index groups. Out-of-range pages are clipped;
 * an empty or invalid spec throws E_UNSUPPORTED.
 */
export function parsePageRanges(spec: string, pageCount: number): number[][] {
  const groups: number[][] = [];
  for (const part of spec
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(part) ?? /^(\d+)$/.exec(part);
    if (!m) throw new JobError('E_UNSUPPORTED', `bad page range "${part}"`);
    const from = m[1] === '' ? 1 : Number(m[1]);
    const to = m.length === 2 ? from : m[2] === '' ? pageCount : Number(m[2]);
    const lo = Math.max(1, Math.min(from, to));
    const hi = Math.min(pageCount, Math.max(from, to));
    if (lo > hi)
      throw new JobError('E_UNSUPPORTED', `page range "${part}" is outside the document`);
    groups.push(Array.from({ length: hi - lo + 1 }, (_, i) => lo - 1 + i));
  }
  if (groups.length === 0) throw new JobError('E_UNSUPPORTED', 'no page ranges');
  return groups;
}

function rangeLabel(group: number[]): string {
  const first = (group[0] ?? 0) + 1;
  const last = (group[group.length - 1] ?? 0) + 1;
  return first === last ? `p${first}` : `p${first}-${last}`;
}

async function loadPdfLib(path: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(await readFile(path));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/encrypt/i.test(message)) throw new JobError('E_ENCRYPTED_PDF');
    throw new JobError('E_CORRUPT_INPUT', message);
  }
}

interface PdfJs {
  getDocument(o: Record<string, unknown>): {
    promise: Promise<PdfDocument>;
    destroy(): Promise<void>;
  };
}
interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  /** Frees the document; present on the loading task, not on the document proxy. */
  release(): Promise<void>;
}
interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: Record<string, unknown>): { promise: Promise<void> };
  getTextContent(): Promise<{ items: { str?: string; hasEOL?: boolean }[] }>;
  cleanup(): void;
}

async function openWithPdfJs(path: string): Promise<PdfDocument> {
  const pdfjs = await dynamicImport<PdfJs>('pdfjs-dist/legacy/build/pdf.mjs');
  const root = dirname(nodeRequire.resolve('pdfjs-dist/package.json'));
  const task = pdfjs.getDocument({
    data: new Uint8Array(await readFile(path)),
    useSystemFonts: true,
    isEvalSupported: false,
    standardFontDataUrl: `${join(root, 'standard_fonts')}${process.platform === 'win32' ? '\\' : '/'}`,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    return Object.assign(doc, { release: () => task.destroy() });
  } catch (error) {
    const name = (error as { name?: string }).name ?? '';
    if (name === 'PasswordException') throw new JobError('E_ENCRYPTED_PDF');
    throw new JobError('E_CORRUPT_INPUT', error instanceof Error ? error.message : name);
  }
}

async function renderPages(input: string, ext: 'png' | 'jpg', ctx: RunContext): Promise<void> {
  const { createCanvas } = nodeRequire('@napi-rs/canvas') as typeof import('@napi-rs/canvas');
  const doc = await openWithPdfJs(input);
  try {
    const base = basename(input).replace(/\.[^.]+$/, '');
    for (let n = 1; n <= doc.numPages; n++) {
      if (ctx.signal.aborted) throw new JobError('E_CANCELLED');
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: DPI / 72 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      if (ext === 'jpg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      await page.render({ canvasContext: context, canvas, viewport }).promise;
      const buffer =
        ext === 'png' ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg', 90);
      await writeFile(join(ctx.tempDir, pageFileName(base, n, ext, doc.numPages)), buffer);
      page.cleanup();
      ctx.onProgress(Math.round((n / doc.numPages) * 100));
    }
  } finally {
    await doc.release();
  }
}

async function extractText(input: string, markdown: boolean, ctx: RunContext): Promise<void> {
  const doc = await openWithPdfJs(input);
  try {
    const parts: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      if (ctx.signal.aborted) throw new JobError('E_CANCELLED');
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items
        .map((i) => (i.str ?? '') + (i.hasEOL ? '\n' : ''))
        .join('')
        .trim();
      parts.push(markdown ? `## Page ${n}\n\n${text}` : text);
      page.cleanup();
      ctx.onProgress(Math.round((n / doc.numPages) * 100));
    }
    await writeFile(ctx.tempPath, parts.join(markdown ? '\n\n---\n\n' : '\n\n') + '\n', 'utf8');
  } finally {
    await doc.release();
  }
}

async function split(input: string, op: Operation, ctx: RunContext): Promise<void> {
  const src = await loadPdfLib(input);
  const count = src.getPageCount();
  const groups = op.params?.every
    ? Array.from({ length: count }, (_, i) => [i])
    : parsePageRanges(String(op.params?.ranges ?? ''), count);
  const base = basename(input).replace(/\.[^.]+$/, '');
  for (const [i, group] of groups.entries()) {
    if (ctx.signal.aborted) throw new JobError('E_CANCELLED');
    const out = await PDFDocument.create();
    for (const page of await out.copyPages(src, group)) out.addPage(page);
    await writeFile(join(ctx.tempDir, `${base}-${rangeLabel(group)}.pdf`), await out.save());
    ctx.onProgress(Math.round(((i + 1) / groups.length) * 100));
  }
}

async function merge(ctx: RunContext): Promise<void> {
  const out = await PDFDocument.create();
  for (const [i, path] of ctx.allInputs.entries()) {
    if (ctx.signal.aborted) throw new JobError('E_CANCELLED');
    const doc = await loadPdfLib(path);
    for (const page of await out.copyPages(doc, doc.getPageIndices())) out.addPage(page);
    ctx.onProgress(Math.round(((i + 1) / ctx.allInputs.length) * 100));
  }
  await writeFile(ctx.tempPath, await out.save());
}

async function compress(input: string, ctx: RunContext): Promise<RunResult> {
  const doc = await loadPdfLib(input);
  // v1 only rewrites object streams; images are not recompressed (docs/05 section 2).
  await writeFile(ctx.tempPath, await doc.save({ useObjectStreams: true }));
  return (await stat(ctx.tempPath)).size >= (await stat(input)).size
    ? { note: 'already-compact' }
    : {};
}

export const pdfEngine: Engine = {
  id: 'pdf',
  canHandle(op, input) {
    if (extensionOf(input) !== 'pdf') return false;
    return op.kind === 'convert' ? CONVERT.has(op.id) : TOOLS.has(op.id);
  },
  async run(op, input, ctx) {
    try {
      if (op.kind === 'convert') {
        if (op.id === 'png' || op.id === 'jpg') return await renderPages(input, op.id, ctx);
        return await extractText(input, op.id === 'md', ctx);
      }
      if (op.id === 'split') return await split(input, op, ctx);
      if (op.id === 'merge') return await merge(ctx);
      return await compress(input, ctx);
    } catch (error) {
      if (error instanceof JobError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      // pdf-lib parses leniently, so a broken file often fails later with a TypeError.
      if (/Pages|catalog|trailer|xref|header|parse|Invalid PDF|undefined/i.test(message)) {
        throw new JobError('E_CORRUPT_INPUT', message);
      }
      throw error;
    }
  },
};
