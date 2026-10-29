import { nodeRequire } from './req';
import { copyFile, readFile, stat, writeFile } from 'node:fs/promises';
import sharp, { type ResizeOptions, type Sharp } from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { extensionOf } from '../../shared/formats';
import {
  JobError,
  type Engine,
  type Operation,
  type RunContext,
  type RunResult,
} from '../jobs/types';
import { encodeBmp } from './bmp';
import { stripMetadata } from './meta';

const OUTPUTS = new Set(['png', 'jpg', 'webp', 'avif', 'tiff', 'bmp', 'pdf']);
const TOOLS = new Set(['compress', 'resize', 'rotate', 'flip', 'strip-metadata']);
const IMAGE_EXTS = new Set(['jpg', 'png', 'webp', 'heic', 'tiff', 'avif', 'bmp']);

/** Formats that cannot be written again after a tool runs, and what they become. */
const TOOL_OUT_EXT: Record<string, string> = { heic: 'jpg', bmp: 'png' };

export function toolOutputExt(inputPath: string): string {
  const ext = extensionOf(inputPath);
  return TOOL_OUT_EXT[ext] ?? ext;
}

function wrap(error: unknown): never {
  if (error instanceof JobError) throw error;
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOSPC/.test(message)) throw new JobError('E_DISK_FULL');
  if (/EACCES|EPERM/.test(message)) throw new JobError('E_PERMISSION');
  if (
    /Input .*(corrupt|unsupported|buffer|file)|VipsJpeg|premature end|bad seek|unsupported image format|heic/i.test(
      message,
    )
  ) {
    throw new JobError('E_CORRUPT_INPUT', message);
  }
  throw error instanceof Error ? error : new Error(message);
}

async function open(input: string): Promise<Sharp> {
  if (extensionOf(input) !== 'heic') return sharp(input, { failOn: 'error' });
  // sharp's prebuilt libvips does not decode HEIC, so decode with heic-convert first (docs/05 section 2).
  const heicConvert = nodeRequire('heic-convert') as (o: {
    buffer: Buffer;
    format: 'PNG' | 'JPEG';
  }) => Promise<ArrayBuffer>;
  const decoded = await heicConvert({ buffer: await readFile(input), format: 'PNG' });
  return sharp(Buffer.from(decoded), { failOn: 'error' });
}

async function encode(
  pipeline: Sharp,
  ext: string,
  quality: number,
  outPath: string,
): Promise<void> {
  switch (ext) {
    case 'png':
      await pipeline.png({ compressionLevel: 9 }).toFile(outPath);
      return;
    case 'jpg':
      await pipeline
        .flatten({ background: '#ffffff' })
        .jpeg({ quality, mozjpeg: true })
        .toFile(outPath);
      return;
    case 'webp':
      await pipeline.webp({ quality }).toFile(outPath);
      return;
    case 'avif':
      await pipeline.avif({ quality }).toFile(outPath);
      return;
    case 'tiff':
      await pipeline.tiff({ quality, compression: 'jpeg' }).toFile(outPath);
      return;
    case 'bmp': {
      const { data, info } = await pipeline
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      await writeFile(outPath, encodeBmp(data, info.width, info.height));
      return;
    }
    default:
      throw new JobError('E_UNSUPPORTED', ext);
  }
}

/** One page per image at 96 DPI; JPEG embedded where there is no transparency. */
async function toPdf(pipeline: Sharp, outPath: string): Promise<void> {
  const oriented = pipeline.rotate();
  const meta = await oriented.clone().metadata();
  const useAlpha = meta.hasAlpha === true;
  const { data, info } = await (useAlpha
    ? oriented.png().toBuffer({ resolveWithObject: true })
    : oriented.jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true }));
  const pdf = await PDFDocument.create();
  const image = useAlpha ? await pdf.embedPng(data) : await pdf.embedJpg(data);
  const page = pdf.addPage([info.width * 0.75, info.height * 0.75]);
  page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  await writeFile(outPath, await pdf.save());
}

/** Picks the highest quality whose output fits the target size, in at most 6 tries. */
async function compress(
  input: string,
  ctx: RunContext,
  ext: string,
  originalSize: number,
): Promise<RunResult> {
  const target = originalSize * (ctx.settings.output.compressTargetPercent / 100);
  let lo = 10;
  let hi = 95;
  let best: { quality: number; size: number } | null = null;
  let smallest: { quality: number; size: number } | null = null;
  for (let i = 0; i < 6 && lo <= hi; i++) {
    if (ctx.signal.aborted) throw new JobError('E_CANCELLED');
    const quality = Math.round((lo + hi) / 2);
    let size: number;
    if (ext === 'png') {
      const buf = await (
        await open(input)
      )
        .png({ compressionLevel: 9, palette: true, quality })
        .toBuffer();
      size = buf.length;
    } else {
      const probe = await open(input);
      const buf = await (
        ext === 'jpg'
          ? probe.rotate().flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true })
          : ext === 'webp'
            ? probe.rotate().webp({ quality })
            : ext === 'avif'
              ? probe.rotate().avif({ quality })
              : probe.rotate().tiff({ quality, compression: 'jpeg' })
      ).toBuffer();
      size = buf.length;
    }
    if (!smallest || size < smallest.size) smallest = { quality, size };
    if (size <= target) {
      best = { quality, size };
      lo = quality + 1;
    } else {
      hi = quality - 1;
    }
    ctx.onProgress(Math.round(((i + 1) / 7) * 100));
  }
  const chosen = best ?? smallest;
  if (!chosen || chosen.size >= originalSize) return { note: 'already-compact' };
  const pipeline = await open(input);
  if (ext === 'png')
    await pipeline
      .png({ compressionLevel: 9, palette: true, quality: chosen.quality })
      .toFile(ctx.tempPath);
  else await encode(pipeline.rotate(), ext, chosen.quality, ctx.tempPath);
  return (await stat(ctx.tempPath)).size >= originalSize ? { note: 'already-compact' } : {};
}

function resizeFor(preset: string, width: number): ResizeOptions {
  switch (preset) {
    case '75%':
      return { width: Math.max(1, Math.round(width * 0.75)) };
    case '1080p':
      return { width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true };
    case '720p':
      return { width: 1280, height: 720, fit: 'inside', withoutEnlargement: true };
    default:
      return { width: Math.max(1, Math.round(width * 0.5)) };
  }
}

export const imageEngine: Engine = {
  id: 'image',
  canHandle(op: Operation, input: string): boolean {
    if (!IMAGE_EXTS.has(extensionOf(input))) return false;
    return op.kind === 'convert' ? OUTPUTS.has(op.id) : TOOLS.has(op.id);
  },
  async run(op, input, ctx): Promise<unknown> {
    try {
      const quality = ctx.settings.output.imageQuality;
      if (op.kind === 'convert') {
        const pipeline = await open(input);
        if (op.id === 'pdf') return await toPdf(pipeline, ctx.tempPath);
        // Auto-rotate by EXIF, then the orientation tag is reset by sharp.
        return await encode(pipeline.rotate(), op.id, quality, ctx.tempPath);
      }
      const outExt = toolOutputExt(input);
      switch (op.id) {
        case 'compress':
          return await compress(input, ctx, outExt, (await stat(input)).size);
        case 'resize': {
          const pipeline = (await open(input)).rotate();
          const meta = await pipeline.clone().metadata();
          const resized = pipeline.resize(
            resizeFor(ctx.settings.output.resizePreset, meta.width ?? 1),
          );
          return await encode(resized, outExt, quality, ctx.tempPath);
        }
        case 'rotate':
          return await encode(
            (await open(input)).rotate().rotate(90),
            outExt,
            quality,
            ctx.tempPath,
          );
        case 'flip':
          return await encode((await open(input)).rotate().flop(), outExt, quality, ctx.tempPath);
        case 'strip-metadata':
          await copyFile(input, ctx.tempPath);
          return await stripMetadata(ctx.tempPath);
        default:
          throw new JobError('E_UNSUPPORTED', op.id);
      }
    } catch (error) {
      return wrap(error);
    }
  },
};
