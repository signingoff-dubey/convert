import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import type { Box } from '../../shared/image-math';
import { JobError } from '../jobs/types';
import { open } from './image';
import { unpacked } from './binaries';
import { nodeRequire } from './req';

const MAX_SIDE = 2400;
const PAD = 4;

interface OcrWorker {
  recognize(
    image: Buffer,
    options: object,
    output: { blocks: boolean },
  ): Promise<{
    data: {
      blocks?: {
        paragraphs: {
          lines: {
            words: {
              text: string;
              confidence: number;
              bbox: { x0: number; y0: number; x1: number; y1: number };
            }[];
          }[];
        }[];
      }[];
    };
  }>;
  terminate(): Promise<unknown>;
}

let worker: Promise<OcrWorker> | null = null;

/** The OCR worker is created on first use and kept for later detections. Language data is bundled, never downloaded. */
function ocr(cacheDir: string): Promise<OcrWorker> {
  worker ??= (async () => {
    const { createWorker } = nodeRequire('tesseract.js') as {
      createWorker(lang: string, oem: number, options: Record<string, unknown>): Promise<OcrWorker>;
    };
    const langPath = unpacked(
      join(dirname(nodeRequire.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int'),
    );
    return createWorker('eng', 1, {
      langPath,
      gzip: true,
      cachePath: cacheDir,
      logger: () => undefined,
    });
  })();
  return worker;
}

/**
 * Finds words in an image, in the coordinates of the EXIF-oriented picture (what the user sees).
 * Large images are analysed at reduced size and the boxes scaled back up.
 */
export async function detectTextBoxes(input: string, cacheDir: string): Promise<Box[]> {
  const oriented = (await open(input)).rotate();
  const { data, info } = await oriented.png().toBuffer({ resolveWithObject: true });
  const scale = Math.min(1, MAX_SIDE / Math.max(info.width, info.height));
  const analysed =
    scale < 1
      ? await sharp(data)
          .resize(Math.round(info.width * scale))
          .png()
          .toBuffer()
      : data;
  try {
    const result = await (await ocr(cacheDir)).recognize(analysed, {}, { blocks: true });
    const boxes: Box[] = [];
    for (const block of result.data.blocks ?? [])
      for (const para of block.paragraphs)
        for (const line of para.lines)
          for (const w of line.words) {
            if (w.text.trim() === '' || w.confidence < 40) continue;
            const x = Math.max(0, Math.floor(w.bbox.x0 / scale) - PAD);
            const y = Math.max(0, Math.floor(w.bbox.y0 / scale) - PAD);
            boxes.push({
              x,
              y,
              w: Math.min(info.width - x, Math.ceil((w.bbox.x1 - w.bbox.x0) / scale) + 2 * PAD),
              h: Math.min(info.height - y, Math.ceil((w.bbox.y1 - w.bbox.y0) / scale) + 2 * PAD),
            });
          }
    return boxes;
  } catch (error) {
    throw new JobError('E_ENGINE_MISSING', error instanceof Error ? error.message : 'OCR engine');
  }
}

export async function shutdownDetectors(): Promise<void> {
  if (!worker) return;
  const w = await worker.catch(() => null);
  worker = null;
  await w?.terminate().catch(() => undefined);
}

/** Folder holding the face detector weights shipped with @vladmandic/face-api (MIT). */
export function faceModelDir(): string {
  return unpacked(join(dirname(nodeRequire.resolve('@vladmandic/face-api/package.json')), 'model'));
}

export interface FaceModelFiles {
  manifest: unknown;
  weights: Buffer;
}

/** Face detection runs in the Redact window (WebGL); main only hands over the weight files. */
export async function readFaceModel(): Promise<FaceModelFiles> {
  const dir = faceModelDir();
  const manifest: unknown = JSON.parse(
    await readFile(join(dir, 'tiny_face_detector_model-weights_manifest.json'), 'utf8'),
  );
  return { manifest, weights: await readFile(join(dir, 'tiny_face_detector_model.bin')) };
}
