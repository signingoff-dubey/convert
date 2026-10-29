import { describe, expect, it } from 'vitest';
import { dragBox, type Handle } from '../src/shared/image-math';

const bounds = { w: 1000, h: 600 };
const start = { x: 200, y: 100, w: 400, h: 300 };
const inside = (b: { x: number; y: number; w: number; h: number }) =>
  b.x >= 0 && b.y >= 0 && b.x + b.w <= bounds.w && b.y + b.h <= bounds.h;

describe('dragBox', () => {
  it('moves and stays inside the image', () => {
    expect(dragBox('move', start, 50, 20, bounds, null)).toEqual({
      x: 250,
      y: 120,
      w: 400,
      h: 300,
    });
    expect(dragBox('move', start, 9999, 9999, bounds, null)).toEqual({
      x: 600,
      y: 300,
      w: 400,
      h: 300,
    });
    expect(dragBox('move', start, -9999, -9999, bounds, null)).toEqual({
      x: 0,
      y: 0,
      w: 400,
      h: 300,
    });
  });
  it('resizes freely from every handle without leaving the image or collapsing', () => {
    for (const h of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as Handle[]) {
      for (const [dx, dy] of [
        [40, 30],
        [-40, -30],
        [9999, 9999],
        [-9999, -9999],
      ]) {
        const b = dragBox(h, start, dx!, dy!, bounds, null);
        expect(inside(b), `${h} ${dx},${dy}`).toBe(true);
        expect(b.w, `${h} w`).toBeGreaterThanOrEqual(8);
        expect(b.h, `${h} h`).toBeGreaterThanOrEqual(8);
      }
    }
  });
  it('drags the east edge by exactly the pointer movement when free', () => {
    expect(dragBox('e', start, 100, 0, bounds, null)).toEqual({ x: 200, y: 100, w: 500, h: 300 });
    expect(dragBox('w', start, 100, 0, bounds, null)).toEqual({ x: 300, y: 100, w: 300, h: 300 });
  });
  it('keeps the aspect ratio for every handle, inside the image', () => {
    for (const ratio of [1, 4 / 3, 16 / 9, 9 / 16]) {
      const box = { x: 100, y: 100, w: Math.round(300 * ratio), h: 300 };
      for (const h of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as Handle[]) {
        for (const [dx, dy] of [
          [40, 30],
          [-40, -30],
          [500, 500],
          [-500, -500],
        ]) {
          const b = dragBox(h, box, dx!, dy!, bounds, ratio);
          expect(inside(b), `${ratio} ${h} ${dx},${dy}`).toBe(true);
          // Rounding to whole pixels can shift the ratio by at most half a pixel on each side.
          expect(Math.abs(b.w / b.h - ratio), `${ratio} ${h}`).toBeLessThanOrEqual(
            0.5 / b.h + (0.5 * ratio) / b.h + 0.01,
          );
        }
      }
    }
  });
  it('anchors the opposite corner when resizing with a ratio', () => {
    const box = { x: 100, y: 100, w: 300, h: 300 };
    const b = dragBox('se', box, 60, 0, bounds, 1);
    expect([b.x, b.y]).toEqual([100, 100]);
    expect(b.w).toBe(b.h);
    const nw = dragBox('nw', box, -50, -50, bounds, 1);
    expect([nw.x + nw.w, nw.y + nw.h]).toEqual([400, 400]);
  });
});
