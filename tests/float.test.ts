import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {}, BrowserWindow: class {}, nativeImage: {}, screen: {} }));

describe('dockBounds', async () => {
  const { dockBounds } = await import('../src/main/windows/float-shelf');
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  it('pins to the right and left edges, centered vertically', () => {
    const r = dockBounds('right', area, 3);
    expect(r.x + r.width).toBe(1920);
    expect(r.y + r.height / 2).toBeCloseTo(520, 0);
    expect(dockBounds('left', area, 3).x).toBe(0);
  });
  it('pins to the top and bottom edges, centered horizontally', () => {
    const b = dockBounds('bottom', area, 4);
    expect(b.y + b.height).toBe(1040);
    expect(b.x + b.width / 2).toBeCloseTo(960, 0);
    expect(dockBounds('top', area, 4).y).toBe(0);
  });
  it('grows with the number of files but never past the screen', () => {
    expect(dockBounds('right', area, 1).height).toBeLessThan(dockBounds('right', area, 6).height);
    expect(dockBounds('right', area, 500).height).toBe(1040);
    expect(dockBounds('top', area, 500).width).toBe(1920);
  });
  it('floats freely when not pinned', () => {
    const f = dockBounds('free', area, 3);
    expect(f.width).toBe(320);
  });
});
