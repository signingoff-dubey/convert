import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { probeDuration } from '../engines/av';
import { ffmpegPath, sevenZipPath } from '../engines/binaries';
import { execFileSafe } from '../engines/exec';
import { htmlToPdf, htmlToPdfAvailable } from '../engines/html-pdf';
import { readMetadata } from '../engines/meta';
import { ocrImage, userCacheDir } from '../engines/ocr';
import type { PdfDocument } from '../engines/pdf';

export interface SelfTestResult {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  ms: number;
}

export interface SelfTestDeps {
  /** Opens a PDF the way conversions do (the hidden reader window in the app). */
  openPdf(file: string): Promise<PdfDocument>;
  /** Whether the global mouse and keyboard hooks started. */
  hooksStarted: boolean;
}

const LIMIT_MS = 60_000;

/** Runs one check, never throws, and gives up after a minute. */
async function check(
  id: string,
  label: string,
  fn: () => Promise<string>,
): Promise<SelfTestResult> {
  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const detail = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('took longer than a minute')), LIMIT_MS);
      }),
    ]);
    return { id, label, ok: true, detail, ms: Date.now() - start };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { id, label, ok: false, detail: detail.slice(0, 300), ms: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Makes each engine do a small real job on this computer: a picture, a sound, an archive, a PDF, a printed page,
 * a read of text. It is the quickest way to learn which part of Convert does not work on a given PC.
 */
export async function runSelfTest(deps: SelfTestDeps): Promise<SelfTestResult[]> {
  const work = await mkdtemp(path.join(tmpdir(), 'convert-selftest-'));
  try {
    const results: SelfTestResult[] = [];
    const run = async (id: string, label: string, fn: () => Promise<string>): Promise<void> => {
      results.push(await check(id, label, fn));
    };

    await run('image', 'Pictures', async () => {
      const png = await sharp({
        create: { width: 16, height: 16, channels: 3, background: '#2a9d8f' },
      })
        .png()
        .toBuffer();
      const webp = await sharp(png).webp().toBuffer();
      if (webp.length < 20) throw new Error('empty result');
      return 'PNG to WebP worked';
    });

    await run('av', 'Audio and video (ffmpeg)', async () => {
      const exe = ffmpegPath();
      if (!exe) throw new Error('ffmpeg is missing');
      const wav = path.join(work, 'tone.wav');
      const res = await execFileSafe(exe, [
        '-hide_banner',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=duration=0.3',
        wav,
      ]);
      if (res.code !== 0) throw new Error(res.stderr.slice(-200));
      const seconds = (await probeDuration(wav)) ?? 0;
      if (seconds < 0.1) throw new Error('the sound it made could not be read back');
      return `made and read a ${seconds.toFixed(1)} s sound`;
    });

    await run('archive', 'Archives (7-Zip)', async () => {
      const exe = sevenZipPath();
      if (!exe) throw new Error('7-Zip is missing');
      await writeFile(path.join(work, 'a.txt'), 'hello');
      const zip = path.join(work, 'a.zip');
      const res = await execFileSafe(exe, ['a', '-tzip', '-y', zip, path.join(work, 'a.txt')]);
      if (res.code !== 0) throw new Error(res.stderr.slice(-200));
      return 'made a ZIP';
    });

    await run('meta', 'Metadata (exiftool)', async () => {
      const jpg = path.join(work, 'm.jpg');
      await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } })
        .jpeg()
        .toFile(jpg);
      const view = await readMetadata(jpg);
      if (view.ImageWidth !== 8) throw new Error('could not read the picture back');
      return "read a picture's details";
    });

    await run('ocr', 'Reading text from pictures', async () => {
      const blank = await sharp({
        create: { width: 64, height: 64, channels: 3, background: '#fff' },
      })
        .raw()
        .toBuffer();
      await ocrImage(sharp(blank, { raw: { width: 64, height: 64, channels: 3 } }), {
        cacheDir: userCacheDir(),
        signal: new AbortController().signal,
      });
      return 'the text reader started';
    });

    await run('pdf', 'PDF reader', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([200, 100]);
      const file = path.join(work, 'p.pdf');
      await writeFile(file, await doc.save());
      const pdf = await deps.openPdf(file);
      try {
        const page = await pdf.getPage(1);
        const image = await page.image(1, 'png');
        if (pdf.numPages !== 1 || image.length < 50) throw new Error('could not draw the page');
        return 'opened a PDF and drew its page';
      } finally {
        await pdf.release();
      }
    });

    await run('print', 'PDF printing (Markdown, HTML, email to PDF)', async () => {
      if (!htmlToPdfAvailable()) throw new Error('the page printer is not available');
      const html = path.join(work, 'p.html');
      const out = path.join(work, 'printed.pdf');
      await writeFile(html, '<html><body><h1>Convert</h1><p>Self-test page.</p></body></html>');
      await htmlToPdf(html, out, new AbortController().signal);
      if ((await readFile(out)).subarray(0, 4).toString() !== '%PDF')
        throw new Error('the result is not a PDF');
      return 'printed a page to PDF';
    });

    await run('hooks', 'Wheel shortcuts (global mouse and keyboard)', async () => {
      if (!deps.hooksStarted) throw new Error('the global input hooks could not start');
      return 'running';
    });
    return results;
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}
