import { copyFile, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import sharp, { type OverlayOptions, type ResizeOptions, type Sharp } from 'sharp';
import { DEFAULT_BG, removeBackground } from '../../shared/bg-remove';
import { extensionOf } from '../../shared/formats';
import {
  HEX,
  bgLayout,
  clampCrop,
  collageLayout,
  isIdentityEdit,
  parseBoxes,
  parseEditParams,
  type EditParams,
  type Ratio,
} from '../../shared/image-math';
import {
  JobError,
  type Engine,
  type Operation,
  type Params,
  type RunContext,
  type RunResult,
} from '../jobs/types';
import { encodeBmp } from './bmp';
import { encodeHeic } from './heic';
import { stripMetadata, writeMetadata } from './meta';
import { nodeRequire } from './req';

const OUTPUTS = new Set(['png', 'jpg', 'webp', 'avif', 'tiff', 'bmp', 'pdf', 'heic']);
const TOOLS = new Set([
  'compress',
  'resize',
  'rotate',
  'flip',
  'strip-metadata',
  'crop',
  'edit',
  'metadata',
  'add-bg',
  'collage',
  'redact',
  'annotate-save',
  'upscale',
  'remove-bg',
]);
const IMAGE_EXTS = new Set(['jpg', 'png', 'webp', 'heic', 'tiff', 'avif', 'bmp', 'svg']);

/** Formats that cannot be written again after a tool runs, and what they become. */
const TOOL_OUT_EXT: Record<string, string> = { heic: 'jpg', bmp: 'png', svg: 'png' };

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
    /Input .*(corrupt|unsupported|buffer|file)|VipsJpeg|premature end|bad seek|unsupported image format|heic|Invalid (SVG|XML)|svg/i.test(
      message,
    )
  ) {
    throw new JobError('E_CORRUPT_INPUT', message);
  }
  throw error instanceof Error ? error : new Error(message);
}

export async function open(input: string): Promise<Sharp> {
  const ext = extensionOf(input);
  if (ext === 'svg') return sharp(input, { density: 192, failOn: 'error' });
  if (ext !== 'heic') return sharp(input, { failOn: 'error' });
  // sharp's prebuilt libvips does not decode HEIC, so decode with heic-convert first (docs/05 section 2).
  const heicConvert = nodeRequire('heic-convert') as (o: {
    buffer: Buffer;
    format: 'PNG' | 'JPEG';
  }) => Promise<ArrayBuffer>;
  const decoded = await heicConvert({ buffer: await readFile(input), format: 'PNG' });
  return sharp(Buffer.from(decoded), { failOn: 'error' });
}

/** Opens and applies EXIF orientation, so every tool works on what the user sees. */
async function openOriented(input: string): Promise<Sharp> {
  return (await open(input)).rotate();
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

/** Adds one page per image at 96 DPI; JPEG is embedded where there is no transparency. */
async function addImagePage(pdf: PDFDocument, pipeline: Sharp): Promise<void> {
  const oriented = pipeline.rotate();
  const meta = await oriented.clone().metadata();
  const useAlpha = meta.hasAlpha === true;
  const { data, info } = await (useAlpha
    ? oriented.png().toBuffer({ resolveWithObject: true })
    : oriented.jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true }));
  const image = useAlpha ? await pdf.embedPng(data) : await pdf.embedJpg(data);
  const page = pdf.addPage([info.width * 0.75, info.height * 0.75]);
  page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
}

async function toPdf(inputs: readonly string[], outPath: string, ctx: RunContext): Promise<void> {
  const pdf = await PDFDocument.create();
  for (const [i, path] of inputs.entries()) {
    if (ctx.signal.aborted) throw new JobError('E_CANCELLED');
    await addImagePage(pdf, await open(path));
    ctx.onProgress(Math.round(((i + 1) / inputs.length) * 100));
  }
  await writeFile(outPath, await pdf.save());
}

// ---- Compress ----------------------------------------------------------------------------

const PRESET_QUALITY: Record<string, number> = { small: 45, balanced: 70, high: 85 };

export function resizeFor(preset: string, width: number, custom?: number): ResizeOptions | null {
  switch (preset) {
    case '50%':
      return { width: Math.max(1, Math.round(width * 0.5)) };
    case '75%':
      return { width: Math.max(1, Math.round(width * 0.75)) };
    case '1080p':
      return { width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true };
    case '720p':
      return { width: 1280, height: 720, fit: 'inside', withoutEnlargement: true };
    case 'custom':
      return custom && custom > 0 ? { width: Math.round(custom), withoutEnlargement: true } : null;
    default:
      return null;
  }
}

function lossyEncoder(pipeline: Sharp, ext: string, quality: number): Sharp {
  switch (ext) {
    case 'jpg':
      return pipeline.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true });
    case 'webp':
      return pipeline.webp({ quality });
    case 'avif':
      return pipeline.avif({ quality });
    case 'tiff':
      return pipeline.tiff({ quality, compression: 'jpeg' });
    default:
      return pipeline.png({ compressionLevel: 9, palette: true, quality });
  }
}

/** Compress: a target percentage, a target size, or a quality preset, optionally resizing first. */
async function compress(input: string, ctx: RunContext, params: Params): Promise<RunResult> {
  const ext = toolOutputExt(input);
  const originalSize = (await stat(input)).size;
  const mode = String(params.mode ?? 'percent');
  const build = async (): Promise<Sharp> => {
    let p = await openOriented(input);
    const resize = String(params.resize ?? 'none');
    if (resize !== 'none') {
      const meta = await p.clone().metadata();
      const opts = resizeFor(resize, meta.width ?? 1, Number(params.width));
      if (opts) p = p.resize(opts);
    }
    return p;
  };

  if (mode === 'preset') {
    const quality = PRESET_QUALITY[String(params.preset ?? 'balanced')] ?? 70;
    await lossyEncoder(await build(), ext, quality).toFile(ctx.tempPath);
    return (await stat(ctx.tempPath)).size >= originalSize ? { note: 'already-compact' } : {};
  }

  const target =
    mode === 'size'
      ? Math.max(1024, Number(params.sizeKb ?? 0) * 1024)
      : originalSize * (Number(params.percent ?? ctx.settings.output.compressTargetPercent) / 100);
  let lo = 10;
  let hi = 95;
  let best: { quality: number; size: number } | null = null;
  let smallest: { quality: number; size: number } | null = null;
  for (let i = 0; i < 6 && lo <= hi; i++) {
    if (ctx.signal.aborted) throw new JobError('E_CANCELLED');
    const quality = Math.round((lo + hi) / 2);
    const size = (await lossyEncoder(await build(), ext, quality).toBuffer()).length;
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
  await lossyEncoder(await build(), ext, chosen.quality).toFile(ctx.tempPath);
  return (await stat(ctx.tempPath)).size >= originalSize ? { note: 'already-compact' } : {};
}

// ---- Edit --------------------------------------------------------------------------------

const SEPIA = [
  [0.393, 0.769, 0.189],
  [0.349, 0.686, 0.168],
  [0.272, 0.534, 0.131],
] as [[number, number, number], [number, number, number], [number, number, number]];

/** Applies exposure, colour, detail and orientation. Order follows what the preview shows. */
export function applyEdits(pipeline: Sharp, e: EditParams): Sharp {
  let p = pipeline;
  if (e.rotate !== 0) p = p.rotate(e.rotate);
  if (e.flipV) p = p.flip();
  if (e.flipH) p = p.flop();
  if (e.exposure !== 0 || e.saturation !== 0) {
    p = p.modulate({
      brightness: 2 ** (e.exposure / 100),
      saturation: Math.max(0, 1 + e.saturation / 100),
    });
  }
  if (e.contrast !== 0) {
    const a = Math.max(0.1, 1 + e.contrast / 100);
    p = p.linear(a, 128 * (1 - a));
  }
  if (e.temperature !== 0) {
    const t = e.temperature / 250;
    p = p.recomb([
      [1 + t, 0, 0],
      [0, 1, 0],
      [0, 0, 1 - t],
    ]);
  }
  if (e.grayscale) p = p.grayscale();
  if (e.sepia) p = p.recomb(SEPIA);
  if (e.sharpen > 0) p = p.sharpen({ sigma: 0.4 + e.sharpen / 40 });
  if (e.blur > 0.3) p = p.blur(e.blur);
  return p;
}

// ---- Add BG, collage, redact -------------------------------------------------------------

const roundedMask = (w: number, h: number, r: number): Buffer =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/></svg>`,
  );

const hexOr = (v: unknown, fallback: string): string =>
  typeof v === 'string' && HEX.test(v) ? v : fallback;

async function rounded(buf: Buffer, w: number, h: number, radius: number): Promise<Buffer> {
  const r = Math.max(0, Math.min(Math.round(radius), Math.floor(Math.min(w, h) / 2)));
  if (r === 0) return buf;
  return sharp(buf)
    .composite([{ input: roundedMask(w, h, r), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function background(params: Params, width: number, height: number): Promise<Buffer> {
  const kind = String(params.bg ?? 'solid');
  const c1 = hexOr(params.color1, '#ffffff');
  if (kind === 'gradient') {
    const c2 = hexOr(params.color2, '#7c5cff');
    const raw = Number(params.angle ?? 135);
    const angle = ((Number.isFinite(raw) ? raw : 135) * Math.PI) / 180;
    // Same convention as CSS linear-gradient: 0deg points up, 90deg points right.
    const dx = Math.sin(angle) / 2;
    const dy = -Math.cos(angle) / 2;
    const f = (n: number): string => (0.5 + n).toFixed(4);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="${f(-dx)}" y1="${f(-dy)}" x2="${f(dx)}" y2="${f(dy)}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
  if (kind === 'image' && typeof params.bgImage === 'string' && params.bgImage !== '') {
    return (await openOriented(params.bgImage))
      .resize(width, height, { fit: 'cover' })
      .png()
      .toBuffer();
  }
  return sharp({ create: { width, height, channels: 4, background: c1 } })
    .png()
    .toBuffer();
}

async function addBg(
  input: string,
  ctx: RunContext,
  params: Params,
  outExt: string,
): Promise<void> {
  const photo = await (await openOriented(input)).png().toBuffer({ resolveWithObject: true });
  const layout = bgLayout(
    photo.info.width,
    photo.info.height,
    String(params.ratio ?? 'auto') as Ratio,
    Number(params.padding ?? 8),
  );
  const { w, h, x, y } = layout.photo;
  const resized =
    w === photo.info.width ? photo.data : await sharp(photo.data).resize(w, h).png().toBuffer();
  const radius = (Math.max(0, Math.min(50, Number(params.radius ?? 0))) / 100) * Math.min(w, h);
  const layer = await rounded(resized, w, h, radius);
  const base = await background(params, layout.canvasW, layout.canvasH);
  await encode(
    sharp(base).composite([{ input: layer, left: x, top: y }]),
    outExt,
    ctx.settings.output.imageQuality,
    ctx.tempPath,
  );
}

async function collage(
  inputs: readonly string[],
  ctx: RunContext,
  params: Params,
  outExt: string,
): Promise<void> {
  const aspects: number[] = [];
  for (const path of inputs) {
    const meta = await (await openOriented(path)).metadata();
    aspects.push((meta.width ?? 1) / (meta.height ?? 1));
  }
  const style =
    (['grid', 'row', 'column', 'featured'] as const).find((s) => s === params.layout) ?? 'grid';
  const width = Math.max(400, Math.min(6000, Number(params.width ?? 2400)));
  const spacing = Math.max(0, Math.min(200, Number(params.spacing ?? 16)));
  const radius = Math.max(0, Math.min(200, Number(params.radius ?? 0)));
  const layout = collageLayout(style, aspects, width, spacing);
  const layers: OverlayOptions[] = [];
  for (const [i, cell] of layout.cells.entries()) {
    if (ctx.signal.aborted) throw new JobError('E_CANCELLED');
    const fitted = await (
      await openOriented(inputs[i] as string)
    )
      .resize(cell.w, cell.h, { fit: 'cover' })
      .png()
      .toBuffer();
    layers.push({
      input: await rounded(fitted, cell.w, cell.h, radius),
      left: cell.x,
      top: cell.y,
    });
    ctx.onProgress(Math.round(((i + 1) / layout.cells.length) * 90));
  }
  const base = sharp({
    create: {
      width: layout.width,
      height: layout.height,
      channels: 4,
      background: hexOr(params.color1, '#ffffff'),
    },
  });
  await encode(base.composite(layers), outExt, ctx.settings.output.imageQuality, ctx.tempPath);
}

async function redact(
  input: string,
  ctx: RunContext,
  params: Params,
  outExt: string,
): Promise<void> {
  const { data, info } = await (
    await openOriented(input)
  )
    .png()
    .toBuffer({ resolveWithObject: true });
  const boxes = parseBoxes(params.boxes, info.width, info.height);
  if (boxes.length === 0)
    throw new JobError('E_UNSUPPORTED', 'nothing to redact: no areas were selected');
  const mode = params.mode === 'blur' ? 'blur' : 'solid';
  const color = hexOr(params.color, '#000000');
  const layers: OverlayOptions[] = [];
  for (const b of boxes) {
    if (mode === 'solid') {
      layers.push({
        input: { create: { width: b.w, height: b.h, channels: 4, background: color } },
        left: b.x,
        top: b.y,
      });
    } else {
      // Heavy blur on the region only; sigma scales with the box so small boxes are fully unreadable.
      const sigma = Math.max(12, Math.min(b.w, b.h) / 4);
      const piece = await sharp(data)
        .extract({ left: b.x, top: b.y, width: b.w, height: b.h })
        .blur(sigma)
        .png()
        .toBuffer();
      layers.push({ input: piece, left: b.x, top: b.y });
    }
  }
  await encode(
    sharp(data).composite(layers),
    outExt,
    ctx.settings.output.imageQuality,
    ctx.tempPath,
  );
}

/** The annotate window renders its own canvas; main re-encodes that PNG into the user's format. */
async function annotateSave(params: Params, ctx: RunContext, outExt: string): Promise<void> {
  const tmp = typeof params.tmp === 'string' ? resolve(params.tmp) : '';
  const okName = /^convert-annot-[0-9a-f]{8}\.png$/.test(basename(tmp));
  if (!okName || dirname(tmp) !== resolve(tmpdir())) {
    throw new JobError('E_UNSUPPORTED', 'annotation data is missing');
  }
  try {
    await encode(sharp(tmp), outExt, ctx.settings.output.imageQuality, ctx.tempPath);
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
}

const MAX_UPSCALED_SIDE = 16000;
const MAX_UPSCALED_PIXELS = 200_000_000;

/** Larger by 2x, 3x or 4x with Lanczos resampling and an optional light sharpen. Not AI: no new detail is invented. */
async function upscale(
  input: string,
  ctx: RunContext,
  params: Params,
  outExt: string,
): Promise<void> {
  const factor = Number(params.factor ?? 2);
  if (![2, 3, 4].includes(factor)) throw new JobError('E_UNSUPPORTED', 'upscale factor');
  const oriented = await openOriented(input);
  const { data, info } = await oriented.toBuffer({ resolveWithObject: true });
  const width = info.width * factor;
  const height = info.height * factor;
  if (
    width > MAX_UPSCALED_SIDE ||
    height > MAX_UPSCALED_SIDE ||
    width * height > MAX_UPSCALED_PIXELS
  )
    throw new JobError('E_UNSUPPORTED', `${factor}x would be too large (${width} by ${height})`);
  let pipeline = sharp(data).resize(width, height, { kernel: 'lanczos3' });
  if (params.sharpen !== false && params.sharpen !== 'false')
    pipeline = pipeline.sharpen({ sigma: 0.6 + factor * 0.2, m1: 0.8, m2: 2 });
  await encode(pipeline, outExt, ctx.settings.output.imageQuality, ctx.tempPath);
}

/** Makes a plain background transparent; always a PNG, since only PNG keeps transparency everywhere. */
async function removeBg(input: string, ctx: RunContext, params: Params): Promise<void> {
  const { data, info } = await (
    await openOriented(input)
  )
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const color = typeof params.color === 'string' ? /^#?([0-9a-f]{6})$/i.exec(params.color) : null;
  const share = removeBackground(data, info.width, info.height, {
    tolerance: Number(params.tolerance ?? DEFAULT_BG.tolerance),
    feather: Number(params.feather ?? DEFAULT_BG.feather),
    contiguous: params.contiguous !== false && params.contiguous !== 'false',
    color: color
      ? [
          parseInt((color[1] as string).slice(0, 2), 16),
          parseInt((color[1] as string).slice(2, 4), 16),
          parseInt((color[1] as string).slice(4, 6), 16),
        ]
      : null,
  });
  if (share < 0.001)
    throw new JobError(
      'E_UNSUPPORTED',
      'no plain background was found to remove; try a higher tolerance',
    );
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(ctx.tempPath);
}

// ---- Engine ------------------------------------------------------------------------------

export const imageEngine: Engine = {
  id: 'image',
  canHandle(op: Operation, input: string): boolean {
    if (!IMAGE_EXTS.has(extensionOf(input))) return false;
    return op.kind === 'convert' ? OUTPUTS.has(op.id) : TOOLS.has(op.id);
  },
  async run(op, input, ctx): Promise<unknown> {
    try {
      const quality = ctx.settings.output.imageQuality;
      const params = op.params ?? {};
      if (op.kind === 'convert') {
        if (op.id === 'pdf')
          return await toPdf(ctx.allInputs.length > 0 ? ctx.allInputs : [input], ctx.tempPath, ctx);
        if (op.id === 'heic') {
          const png = `${ctx.tempPath}.png`;
          try {
            await encode(await openOriented(input), 'png', quality, png);
            return await encodeHeic(png, ctx.tempPath, ctx.signal);
          } finally {
            await unlink(png).catch(() => undefined);
          }
        }
        // Auto-rotate by EXIF; sharp resets the orientation tag afterwards.
        return await encode(await openOriented(input), op.id, quality, ctx.tempPath);
      }
      const outExt = toolOutputExt(input);
      switch (op.id) {
        case 'compress':
          return await compress(input, ctx, params);
        case 'resize': {
          const pipeline = await openOriented(input);
          const meta = await pipeline.clone().metadata();
          const opts = resizeFor(ctx.settings.output.resizePreset, meta.width ?? 1);
          return await encode(
            opts ? pipeline.resize(opts) : pipeline,
            outExt,
            quality,
            ctx.tempPath,
          );
        }
        case 'rotate':
          return await encode(
            (await openOriented(input)).rotate(90),
            outExt,
            quality,
            ctx.tempPath,
          );
        case 'flip':
          return await encode((await openOriented(input)).flop(), outExt, quality, ctx.tempPath);
        case 'strip-metadata':
          await copyFile(input, ctx.tempPath);
          return await stripMetadata(ctx.tempPath);
        case 'metadata':
          await copyFile(input, ctx.tempPath);
          return await writeMetadata(ctx.tempPath, params);
        case 'crop': {
          const oriented = await openOriented(input);
          const meta = await oriented.clone().toBuffer({ resolveWithObject: true });
          const box = clampCrop(
            {
              left: Number(params.left),
              top: Number(params.top),
              width: Number(params.width),
              height: Number(params.height),
            },
            meta.info.width,
            meta.info.height,
          );
          if (!box) throw new JobError('E_UNSUPPORTED', 'crop area is empty');
          let p = sharp(meta.data).extract(box);
          const outW = Number(params.outWidth);
          const outH = Number(params.outHeight);
          if (outW >= 1 && outH >= 1)
            p = p.resize(Math.round(outW), Math.round(outH), { fit: 'fill' });
          return await encode(p, outExt, quality, ctx.tempPath);
        }
        case 'edit': {
          const edits = parseEditParams(params);
          if (isIdentityEdit(edits))
            throw new JobError('E_UNSUPPORTED', 'no adjustments were made');
          return await encode(
            applyEdits(await openOriented(input), edits),
            outExt,
            quality,
            ctx.tempPath,
          );
        }
        case 'add-bg':
          return await addBg(
            input,
            ctx,
            params,
            outExt === 'png' || outExt === 'jpg' ? outExt : 'png',
          );
        case 'upscale':
          return await upscale(input, ctx, params, outExt);
        case 'remove-bg':
          return await removeBg(input, ctx, params);
        case 'collage':
          return await collage(ctx.allInputs, ctx, params, params.format === 'jpg' ? 'jpg' : 'png');
        case 'redact':
          return await redact(input, ctx, params, outExt);
        case 'annotate-save':
          return await annotateSave(params, ctx, outExt === 'jpg' ? 'jpg' : 'png');
        default:
          throw new JobError('E_UNSUPPORTED', op.id);
      }
    } catch (error) {
      return wrap(error);
    }
  },
};
