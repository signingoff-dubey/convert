import { createCanvas, Path2D } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import {
  fillets,
  labelPoint,
  pointAt,
  roundedSectorPath,
} from '../src/renderer/components/wheel-geometry';

const C = 150;
const R0 = 55;
const R1 = 125;
const dist = (p: [number, number], q: [number, number] = [C, C]) =>
  Math.hypot(p[0] - q[0], p[1] - q[1]);

describe('fillets', () => {
  it('are tangent to the edge and to both circles', () => {
    const theta = (2 * Math.PI) / 6;
    const gap = 3;
    const f = fillets(R0, R1, theta, gap, 14);
    expect(f.rc).toBe(14);
    const a0 = 0.3;
    // Outer start corner: fillet centre is at (uOuter, gap + rc) along and across the start edge.
    const oc = pointAt(C, C, a0, f.uOuter, gap + f.rc);
    expect(dist(oc)).toBeCloseTo(R1 - f.rc, 6); // internally tangent to the outer circle
    expect(dist(oc, pointAt(C, C, a0, f.uOuter, gap))).toBeCloseTo(f.rc, 6); // tangent to the edge line
    const ic = pointAt(C, C, a0, f.uInner, gap + f.rc);
    expect(dist(ic)).toBeCloseTo(R0 + f.rc, 6); // externally tangent to the inner circle
    expect(dist(ic, pointAt(C, C, a0, f.uInner, gap))).toBeCloseTo(f.rc, 6);
    // And the tangent points on the circles are where phi says they are.
    expect(dist(pointAt(C, C, a0 + f.phiOuter, R1, 0))).toBeCloseTo(R1, 6);
    expect(dist(oc, pointAt(C, C, a0 + f.phiOuter, R1, 0))).toBeCloseTo(f.rc, 5);
    expect(dist(ic, pointAt(C, C, a0 + f.phiInner, R0, 0))).toBeCloseTo(f.rc, 5);
  });
  it('shrink the radius for sections too small to hold it', () => {
    const thin = fillets(R0, R1, 0.2, 3, 30);
    expect(thin.rc).toBeLessThan(30);
    expect(thin.rc).toBeGreaterThan(0);
    expect(Math.atan2(3 + thin.rc, thin.uInner)).toBeLessThan(0.1);
  });
});

describe('roundedSectorPath', () => {
  const theta = (2 * Math.PI) / 6;
  const path = roundedSectorPath(C, C, R0, R1, 0, theta, 3, 14);
  const canvas = createCanvas(300, 300);
  const ctx = canvas.getContext('2d');
  const inside = (p: [number, number]) => ctx.isPointInPath(new Path2D(path), p[0], p[1]);

  it('has the four fillets, two big arcs, and closes', () => {
    expect(path.startsWith('M ')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    expect(path.match(/A 14\.00 14\.00/g)).toHaveLength(4);
    expect(path).toContain(`A ${R1.toFixed(2)} ${R1.toFixed(2)}`);
    expect(path).toContain(`A ${R0.toFixed(2)} ${R0.toFixed(2)}`);
  });
  it('contains the middle of the section and nothing outside it', () => {
    expect(inside(labelPoint(C, C, R0, R1, 0, theta))).toBe(true);
    expect(inside(pointAt(C, C, theta / 2, R0 - 10, 0))).toBe(false); // in the hole
    expect(inside(pointAt(C, C, theta / 2, R1 + 6, 0))).toBe(false); // beyond the ring
    expect(inside(pointAt(C, C, theta * 1.5, (R0 + R1) / 2, 0))).toBe(false); // neighbouring section
  });
  it('leaves a gap along the shared edge', () => {
    expect(inside(pointAt(C, C, theta, 90, 1))).toBe(false); // on the next edge
    expect(inside(pointAt(C, C, 0, 90, 1))).toBe(false); // within the gap of the start edge
    expect(inside(pointAt(C, C, 0, 90, 6))).toBe(true);
  });
  it('rounds the corners: the sharp corner point is outside, a point just inside the fillet is in', () => {
    const sharpOuterStart = pointAt(C, C, 0, Math.sqrt(R1 ** 2 - 4 ** 2), 4);
    expect(inside(sharpOuterStart)).toBe(false);
    const f = fillets(R0, R1, theta, 3, 14);
    const centre = pointAt(C, C, 0, f.uOuter, 3 + f.rc);
    expect(inside(centre)).toBe(true);
  });
  it('is a plain sector when the corner radius is zero', () => {
    const plain = roundedSectorPath(C, C, R0, R1, 0, theta, 3, 0);
    expect(plain).not.toMatch(/A 14/);
    expect(plain.endsWith('Z')).toBe(true);
  });
});
