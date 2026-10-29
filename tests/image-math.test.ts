import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EDIT,
  bgLayout,
  clampCrop,
  collageLayout,
  editToCssFilter,
  fitRatioBox,
  isIdentityEdit,
  parseBoxes,
  parseEditParams,
} from '../src/shared/image-math';

describe('bgLayout', () => {
  it('centers the photo with padding on an auto canvas', () => {
    const l = bgLayout(1000, 500, 'auto', 10);
    expect(l.canvasW).toBe(1200);
    expect(l.canvasH).toBe(700);
    expect(l.photo).toEqual({ x: 100, y: 100, w: 1000, h: 500 });
  });
  it('grows the canvas to the requested ratio without shrinking the photo', () => {
    const sq = bgLayout(1000, 500, 'auto', 0);
    expect([sq.canvasW, sq.canvasH]).toEqual([1000, 500]);
    const one = bgLayout(1000, 500, '1:1', 0);
    expect([one.canvasW, one.canvasH]).toEqual([1000, 1000]);
    expect(one.photo.y).toBe(250);
    const wide = bgLayout(500, 1000, '16:9', 0);
    expect(wide.canvasW / wide.canvasH).toBeCloseTo(16 / 9, 2);
    expect(wide.photo.h).toBe(1000);
  });
  it('caps the canvas and scales the photo with it', () => {
    const l = bgLayout(8000, 6000, '1:1', 20);
    expect(Math.max(l.canvasW, l.canvasH)).toBeLessThanOrEqual(8000);
    expect(l.photo.x + l.photo.w).toBeLessThanOrEqual(l.canvasW);
  });
});

describe('collageLayout', () => {
  const inside = (c: {
    width: number;
    height: number;
    cells: { x: number; y: number; w: number; h: number }[];
  }) =>
    c.cells.every(
      (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= c.width + 1 && r.y + r.h <= c.height + 1,
    );
  const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  it.each(['grid', 'row', 'column', 'featured'] as const)(
    '%s keeps cells inside the canvas and apart',
    (style) => {
      for (const n of [2, 3, 4, 5, 7]) {
        const l = collageLayout(
          style,
          Array.from({ length: n }, (_, i) => 0.6 + i * 0.4),
          1200,
          12,
        );
        expect(l.cells).toHaveLength(n);
        expect(inside(l), `${style} ${n}`).toBe(true);
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++) {
            expect(overlap(l.cells[i]!, l.cells[j]!), `${style} ${n} ${i}/${j}`).toBe(false);
          }
      }
    },
  );
  it('row gives every image the same height; column the same width', () => {
    const row = collageLayout('row', [1, 2, 0.5], 1000, 10);
    expect(new Set(row.cells.map((c) => c.h)).size).toBe(1);
    const col = collageLayout('column', [1, 2, 0.5], 1000, 10);
    expect(new Set(col.cells.map((c) => c.w)).size).toBe(1);
  });
  it('grid uses a near-square arrangement', () => {
    const l = collageLayout('grid', [1, 1, 1, 1, 1], 900, 0);
    expect(new Set(l.cells.map((c) => c.x)).size).toBe(3);
    expect(l.height).toBe(2 * l.cells[0]!.h);
  });
  it('featured puts the first image in the large cell', () => {
    const l = collageLayout('featured', [1, 1, 1, 1], 1200, 10);
    expect(l.cells[0]!.w).toBeGreaterThan(l.cells[1]!.w);
    expect(l.cells[0]!.h).toBeGreaterThan(l.cells[1]!.h);
  });
  it('handles empty input', () => {
    expect(collageLayout('grid', [], 800, 8).cells).toEqual([]);
  });
});

describe('crop', () => {
  it('clamps boxes into the image', () => {
    expect(clampCrop({ left: -5, top: 10, width: 5000, height: 20 }, 100, 50)).toEqual({
      left: 0,
      top: 10,
      width: 100,
      height: 20,
    });
    expect(clampCrop({ left: 200, top: 0, width: 10, height: 10 }, 100, 50)?.left).toBe(99);
    expect(clampCrop({ left: 0, top: 0, width: 0, height: 5 }, 100, 50)).toBeNull();
  });
  it('fits the largest centered box for a ratio', () => {
    expect(fitRatioBox(1000, 500, 1)).toEqual({ left: 250, top: 0, width: 500, height: 500 });
    expect(fitRatioBox(400, 900, 16 / 9)).toEqual({ left: 0, top: 338, width: 400, height: 225 });
  });
});

describe('edit params', () => {
  it('defaults to identity and ignores junk', () => {
    expect(isIdentityEdit(parseEditParams({}))).toBe(true);
    const e = parseEditParams({ exposure: 'abc', contrast: 9999, rotate: 100, grayscale: 'true' });
    expect(e.exposure).toBe(0);
    expect(e.contrast).toBe(100);
    expect(e.rotate).toBe(90);
    expect(e.grayscale).toBe(true);
  });
  it('renders a CSS filter for the preview', () => {
    expect(editToCssFilter(DEFAULT_EDIT)).toContain('brightness(1.000)');
    expect(editToCssFilter({ ...DEFAULT_EDIT, exposure: 100, blur: 2, sepia: true })).toMatch(
      /brightness\(2\.000\).*blur\(2px\).*sepia/,
    );
  });
});

describe('parseBoxes', () => {
  it('keeps valid boxes, clamps them, and drops the rest', () => {
    const json = JSON.stringify([
      { x: 10, y: 10, w: 20, h: 20 },
      { x: -5, y: 0, w: 1e9, h: 5 },
      { x: 'a' },
      null,
      { x: 500, y: 0, w: 5, h: 5 },
    ]);
    expect(parseBoxes(json, 100, 100)).toEqual([
      { x: 10, y: 10, w: 20, h: 20 },
      { x: 0, y: 0, w: 100, h: 5 },
    ]);
  });
  it('rejects non-JSON, non-arrays and oversized input', () => {
    expect(parseBoxes('{', 10, 10)).toEqual([]);
    expect(parseBoxes('{"a":1}', 10, 10)).toEqual([]);
    expect(parseBoxes(5, 10, 10)).toEqual([]);
    expect(parseBoxes('['.padEnd(300_000, ' '), 10, 10)).toEqual([]);
  });
});
