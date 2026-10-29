import { describe, expect, it } from 'vitest';
import { physicalToDip, type DisplayInfo } from '../src/main/overlay/dpi';
import { OVERLAY_PADDING, WHEEL_DIAMETER, placeOverlay } from '../src/main/overlay/geometry';
import { hitTest, type WheelGeometry } from '../src/renderer/overlay/hit-test';

const mk = (
  scale: number,
  physX: number,
  physW: number,
  physH: number,
  dipX: number,
): DisplayInfo => ({
  scaleFactor: scale,
  physicalBounds: { x: physX, y: 0, width: physW, height: physH },
  bounds: { x: dipX, y: 0, width: physW / scale, height: physH / scale },
});

describe('physicalToDip', () => {
  it.each([[1], [1.25], [1.5]])('divides by the scale factor at %d', (s) => {
    const d = mk(s, 0, 1920, 1080, 0);
    expect(physicalToDip({ x: 300, y: 150 }, [d])).toEqual({ x: 300 / s, y: 150 / s });
  });
  it('handles mixed DPI by picking the monitor under the point', () => {
    const left = mk(1.5, 0, 2880, 1620, 0); // 1920x1080 DIP
    const right = mk(1, 2880, 1920, 1080, 1920);
    expect(physicalToDip({ x: 2880 + 100, y: 40 }, [left, right])).toEqual({ x: 2020, y: 40 });
    expect(physicalToDip({ x: 300, y: 300 }, [left, right])).toEqual({ x: 200, y: 200 });
  });
  it('uses the nearest monitor for points in a gap, and passes through with no monitors', () => {
    const d = mk(2, 0, 1000, 1000, 0);
    expect(physicalToDip({ x: 1200, y: 100 }, [d])).toEqual({ x: 600, y: 50 });
    expect(physicalToDip({ x: 5, y: 6 }, [])).toEqual({ x: 5, y: 6 });
  });
});

describe('placeOverlay', () => {
  const work = { x: 0, y: 0, width: 1920, height: 1040 };
  it('centers on the cursor with the cursor in the hole', () => {
    const p = placeOverlay({ x: 960, y: 500 }, 'm', work);
    const side = WHEEL_DIAMETER.m + OVERLAY_PADDING * 2;
    expect(p.window).toEqual({ x: 960 - side / 2, y: 500 - side / 2, width: side, height: side });
    expect(p.cursorInHole).toBe(true);
  });
  it('clamps into the work area and reports when the cursor leaves the hole', () => {
    const p = placeOverlay({ x: 5, y: 1035 }, 'l', work);
    expect(p.window.x).toBe(0);
    expect(p.window.y + p.window.height).toBe(1040);
    expect(p.cursorInHole).toBe(false);
  });
  it('never exceeds a work area smaller than the wheel', () => {
    const p = placeOverlay({ x: 50, y: 50 }, 'l', { x: 0, y: 0, width: 100, height: 100 });
    expect(p.window.x).toBe(0);
  });
});

describe('hitTest', () => {
  const wheel: WheelGeometry = {
    center: { x: 100, y: 100 },
    innerRadius: 30,
    outerRadius: 90,
    wedgeCount: 4,
  };
  it('detects hole and outside', () => {
    expect(hitTest({ x: 105, y: 100 }, wheel)).toEqual({ kind: 'hole' });
    expect(hitTest({ x: 100, y: 0 }, wheel)).toEqual({ kind: 'outside' });
  });
  it("numbers wedges clockwise from 12 o'clock", () => {
    expect(hitTest({ x: 110, y: 50 }, wheel)).toEqual({ kind: 'wedge', index: 0 }); // just right of top
    expect(hitTest({ x: 150, y: 100 }, wheel)).toEqual({ kind: 'wedge', index: 1 }); // 3 o'clock
    expect(hitTest({ x: 100, y: 150 }, wheel)).toEqual({ kind: 'wedge', index: 2 }); // 6 o'clock
    expect(hitTest({ x: 50, y: 100 }, wheel)).toEqual({ kind: 'wedge', index: 3 }); // 9 o'clock
    expect(hitTest({ x: 90, y: 50 }, wheel)).toEqual({ kind: 'wedge', index: 3 }); // just left of top
  });
  it('handles seven wedges and an empty wheel', () => {
    const seven = { ...wheel, wedgeCount: 7 };
    const idx = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const a = ((i + 0.5) / 7) * 2 * Math.PI;
      const r = hitTest({ x: 100 + 60 * Math.sin(a), y: 100 - 60 * Math.cos(a) }, seven);
      return r.kind === 'wedge' ? r.index : -1;
    });
    expect(idx).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(hitTest({ x: 100, y: 50 }, { ...wheel, wedgeCount: 0 })).toEqual({ kind: 'outside' });
  });
});

import { vi } from 'vitest';
vi.mock('lucide-react', () => ({}));

describe('labelSize', async () => {
  const { labelSize } = await import('../src/renderer/components/Wheel');
  it('shrinks long labels on crowded small wheels, within a readable range', () => {
    const crowded = labelSize('ANNOTATE', 220, 7);
    expect(crowded).toBeLessThan(10.5);
    expect(crowded).toBeGreaterThanOrEqual(8);
    expect(labelSize('PNG', 280, 7)).toBe(12);
  });
  it('never exceeds the natural size', () => {
    expect(labelSize('A', 340, 3)).toBeLessThanOrEqual(12);
  });
});
