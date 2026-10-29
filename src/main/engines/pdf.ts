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
import { buildEpub } from './epub';
import { ocrImage, userCacheDir } from './ocr';
import sharp from 'sharp';

const CONVERT = new Set(['png', 'jpg', 'txt', 'md', 'epub', 'xlsx']);
const TOOLS = new Set(['compress', 'split', 'merge', 'delete-pages']);
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

export interface TextItem {
  str?: string;
  hasEOL?: boolean;
  /** [a, b, c, d, x, y] in PDF points; y grows upward. */
  transform?: number[];
  width?: number;
  height?: number;
}

interface LineItem {
  str: string;
  x: number;
  width: number;
}

interface Line {
  y: number;
  height: number;
  items: LineItem[];
}

/** Groups text items into lines top to bottom, items left to right. */
export function groupLines(items: readonly TextItem[], tolerance = 3): Line[] {
  const lines: Line[] = [];
  for (const it of items) {
    const str = it.str ?? '';
    if (str.trim() === '' || !it.transform) continue;
    const x = it.transform[4] ?? 0;
    const y = it.transform[5] ?? 0;
    const line = lines.find((l) => Math.abs(l.y - y) <= tolerance);
    const entry = { str, x, width: it.width ?? str.length * 5 };
    if (line) line.items.push(entry);
    else lines.push({ y, height: it.height ?? 10, items: [entry] });
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => b.y - a.y);
}

/** Splits each line into cells wherever the horizontal gap is wider than a few characters. */
export function rowsFromTextItems(items: readonly TextItem[], gap = 12): string[][] {
  return groupLines(items).map((line) => {
    const cells: string[] = [];
    let end = Number.NEGATIVE_INFINITY;
    for (const it of line.items) {
      if (cells.length === 0 || it.x - end > gap) cells.push(it.str.trim());
      else
        cells[cells.length - 1] = `${cells[cells.length - 1]} ${it.str}`
          .replace(/\s+/g, ' ')
          .trim();
      end = it.x + it.width;
    }
    return cells;
  });
}

/** Rebuilds paragraphs from hard-wrapped lines using vertical gaps; joins hyphenated line breaks. */
export function paragraphsFromItems(items: readonly TextItem[]): string[] {
  const lines = groupLines(items);
  if (lines.length === 0) return [];
  const gaps = lines
    .slice(1)
    .map((l, i) => (lines[i] as Line).y - l.y)
    .sort((a, b) => a - b);
  const typical = gaps[Math.floor(gaps.length / 2)] ?? 12;
  const paragraphs: string[] = [];
  let current = '';
  lines.forEach((line, i) => {
    const text = line.items
      .map((x) => x.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const gap = i === 0 ? 0 : (lines[i - 1] as Line).y - line.y;
    if (i > 0 && gap > typical * 1.6) {
      paragraphs.push(current);
      current = text;
    } else if (current.endsWith('-') && /^[a-z]/.test(text)) current = current.slice(0, -1) + text;
    else current = current === '' ? text : `${current} ${text}`;
  });
  if (current !== '') paragraphs.push(current);
  return paragraphs;
}

/** One page of a PDF opened for reading. Implemented by pdf.js, in a hidden Chromium window or in plain Node. */
export interface PdfPage {
  /** Page size in PDF points. */
  size(): { width: number; height: number };
  /** The page drawn at `scale` (1 = 72 dpi): PNG, or JPEG on white. */
  image(scale: number, format: 'png' | 'jpg'): Promise<Buffer>;
  text(): Promise<TextItem[]>;
  cleanup(): void;
}
export interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  release(): Promise<void>;
}

let backend: ((path: string) => Promise<PdfDocument>) | null = null;

/**
 * Inside Electron, pdf.js runs in a hidden Chromium window, because the native canvas module that pdf.js
 * would use in Node cannot be loaded there. Tests and plain Node use the fallback below.
 */
export function setPdfBackend(open: ((path: string) => Promise<PdfDocument>) | null): void {
  backend = open;
}

function openPdf(path: string): Promise<PdfDocument> {
  return backend ? backend(path) : openWithPdfJs(path);
}

interface NodePdfJs {
  getDocument(o: Record<string, unknown>): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getViewport(o: { scale: number }): { width: number; height: number };
        render(o: Record<string, unknown>): { promise: Promise<void> };
        getTextContent(): Promise<{ items: TextItem[] }>;
        cleanup(): void;
      }>;
    }>;
    destroy(): Promise<void>;
  };
}

async function openWithPdfJs(path: string): Promise<PdfDocument> {
  const pdfjs = await dynamicImport<NodePdfJs>('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = nodeRequire('@napi-rs/canvas') as typeof import('@napi-rs/canvas');
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
    return {
      numPages: doc.numPages,
      release: () => task.destroy(),
      async getPage(n) {
        const page = await doc.getPage(n);
        return {
          size: () => page.getViewport({ scale: 1 }),
          async image(scale, format) {
            const viewport = page.getViewport({ scale });
            const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
            const context = canvas.getContext('2d');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: context, canvas, viewport }).promise;
            return format === 'png'
              ? canvas.toBuffer('image/png')
              : canvas.toBuffer('image/jpeg', 90);
          },
          text: async () => (await page.getTextContent()).items,
          cleanup: () => page.cleanup(),
        };
      },
    };
  } catch (error) {
    const name = (error as { name?: string }).name ?? '';
    if (name === 'PasswordException') throw new JobError('E_ENCRYPTED_PDF');
    throw new JobError('E_CORRUPT_INPUT', error instanceof Error ? error.message : name);
  }
}

export async function renderPages(
  input: string,
  ext: 'png' | 'jpg',
  ctx: RunContext,
): Promise<void> {
  const doc = await openPdf(input);
  try {
    const base = basename(input).replace(/\.[^.]+$/, '');
    for (let n = 1; n <= doc.numPages; n++) {
      if (ctx.signal.aborted) throw new JobError('E_CANCELLED');
      const page = await doc.getPage(n);
      const buffer = await page.image(DPI / 72, ext);
      await writeFile(join(ctx.outDir, pageFileName(base, n, ext, doc.numPages)), buffer);
      page.cleanup();
      ctx.onProgress(Math.round((n / doc.numPages) * 100));
    }
  } finally {
    await doc.release();
  }
}

/** Pictures of pages for the Delete pages window, `width` pixels wide. */
export async function pageThumbnails(
  input: string,
  from: number,
  count: number,
  width: number,
): Promise<{ pages: number; thumbs: Buffer[] }> {
  const doc = await openPdf(input);
  try {
    const thumbs: Buffer[] = [];
    for (let n = from; n < from + count && n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      thumbs.push(await page.image(width / page.size().width, 'png'));
      page.cleanup();
    }
    return { pages: doc.numPages, thumbs };
  } finally {
    await doc.release();
  }
}

async function extractText(input: string, markdown: boolean, ctx: RunContext): Promise<void> {
  const doc = await openPdf(input);
  try {
    const parts: string[] = [];
    const scanned: number[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      if (ctx.signal.aborted) throw new JobError('E_CANCELLED');
      const page = await doc.getPage(n);
      const text = (await page.text())
        .map((i) => (i.str ?? '') + (i.hasEOL ? '\n' : ''))
        .join('')
        .trim();
      // A page with no text layer is a picture of text (a scan): read it with OCR below.
      if (text === '') scanned.push(n);
      parts.push(text);
      page.cleanup();
      ctx.onProgress(Math.round((n / doc.numPages) * (scanned.length > 0 ? 40 : 100)));
    }
    for (const [i, n] of scanned.entries()) {
      if (ctx.signal.aborted) throw new JobError('E_CANCELLED');
      const page = await doc.getPage(n);
      const png = await page.image(2.5, 'png');
      page.cleanup();
      parts[n - 1] = await ocrImage(sharp(png), { cacheDir: userCacheDir(), signal: ctx.signal });
      ctx.onProgress(40 + Math.round(((i + 1) / scanned.length) * 60));
    }
    const pages = parts.map((text, i) => (markdown ? `## Page ${i + 1}\n\n${text}` : text));
    await writeFile(ctx.tempPath, pages.join(markdown ? '\n\n---\n\n' : '\n\n') + '\n', 'utf8');
  } finally {
    await doc.release();
  }
}

async function toEpub(input: string, ctx: RunContext): Promise<void> {
  const doc = await openPdf(input);
  try {
    const title = basename(input).replace(/\.[^.]+$/, '');
    const html: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      if (ctx.signal.aborted) throw new JobError('E_CANCELLED');
      const page = await doc.getPage(n);
      const paras = paragraphsFromItems(await page.text());
      html.push(paras.map((p) => `<p>${escapeXml(p)}</p>`).join('\n'));
      page.cleanup();
      ctx.onProgress(Math.round((n / doc.numPages) * 100));
    }
    const body = html.join('\n<hr/>\n');
    if (body.replace(/<[^>]+>|\s/g, '') === '') {
      throw new JobError('E_UNSUPPORTED', 'this PDF has no text to put in an EPUB (is it a scan?)');
    }
    await writeFile(
      ctx.tempPath,
      await buildEpub({
        title,
        chapters: [{ title, html: `<h1>${escapeXml(title)}</h1>\n${body}` }],
      }),
    );
  } finally {
    await doc.release();
  }
}

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Best effort: text positions become rows and cells, one worksheet per page. */
async function toXlsx(input: string, ctx: RunContext): Promise<void> {
  const ExcelJS = nodeRequire('exceljs') as typeof import('exceljs');
  const doc = await openPdf(input);
  try {
    const wb = new ExcelJS.Workbook();
    let any = false;
    for (let n = 1; n <= doc.numPages; n++) {
      if (ctx.signal.aborted) throw new JobError('E_CANCELLED');
      const page = await doc.getPage(n);
      const rows = rowsFromTextItems(await page.text());
      if (rows.length > 0) any = true;
      wb.addWorksheet(`Page ${n}`).addRows(rows);
      page.cleanup();
      ctx.onProgress(Math.round((n / doc.numPages) * 100));
    }
    if (!any)
      throw new JobError(
        'E_UNSUPPORTED',
        'this PDF has no text to put in a spreadsheet (is it a scan?)',
      );
    await wb.xlsx.writeFile(ctx.tempPath);
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
    await writeFile(join(ctx.outDir, `${base}-${rangeLabel(group)}.pdf`), await out.save());
    ctx.onProgress(Math.round(((i + 1) / groups.length) * 100));
  }
}

async function deletePages(input: string, op: Operation, ctx: RunContext): Promise<void> {
  const src = await loadPdfLib(input);
  const keep = [
    ...new Set(parsePageRanges(String(op.params?.keep ?? ''), src.getPageCount()).flat()),
  ].sort((a, b) => a - b);
  if (keep.length === src.getPageCount())
    throw new JobError('E_UNSUPPORTED', 'every page is kept, so there is nothing to delete');
  const out = await PDFDocument.create();
  for (const page of await out.copyPages(src, keep)) out.addPage(page);
  out.setTitle(src.getTitle() ?? '');
  out.setAuthor(src.getAuthor() ?? '');
  await writeFile(ctx.tempPath, await out.save());
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
        if (op.id === 'epub') return await toEpub(input, ctx);
        if (op.id === 'xlsx') return await toXlsx(input, ctx);
        return await extractText(input, op.id === 'md', ctx);
      }
      if (op.id === 'split') return await split(input, op, ctx);
      if (op.id === 'delete-pages') return await deletePages(input, op, ctx);
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
