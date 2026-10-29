import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { detectTextBoxes, readFaceModel, shutdownDetectors } from '../src/main/engines/detect';

const dir = mkdtempSync(join(tmpdir(), 'convert-detect-'));
afterAll(async () => {
  await shutdownDetectors();
  rmSync(dir, { recursive: true, force: true });
});

describe('text detection (offline OCR)', () => {
  it('finds words and returns padded boxes in image coordinates', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="160"><rect width="100%" height="100%" fill="white"/><text x="20" y="100" font-size="64" font-family="DejaVu Sans, Arial, sans-serif" fill="black">HELLO WORLD</text></svg>`;
    const file = join(dir, 'text.png');
    writeFileSync(file, await sharp(Buffer.from(svg)).png().toBuffer());
    const boxes = await detectTextBoxes(file, join(dir, 'cache'));
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(500);
      expect(b.y + b.h).toBeLessThanOrEqual(160);
    }
    const left = boxes.reduce((m, b) => Math.min(m, b.x), 999);
    expect(left).toBeLessThan(40);
  }, 60_000);
  it('returns nothing for a blank image', async () => {
    const file = join(dir, 'blank.png');
    writeFileSync(
      file,
      await sharp({ create: { width: 200, height: 100, channels: 3, background: '#fff' } })
        .png()
        .toBuffer(),
    );
    expect(await detectTextBoxes(file, join(dir, 'cache'))).toEqual([]);
  }, 60_000);
});

describe('face model files', () => {
  it('ships the tiny detector weights with a matching manifest', async () => {
    const m = await readFaceModel();
    expect(m.weights.length).toBeGreaterThan(100_000);
    expect(JSON.stringify(m.manifest)).toContain('tiny_face_detector_model.bin');
  });
});
