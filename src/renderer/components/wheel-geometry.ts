/** Pure geometry for the wheel: pie sections with real rounded corners. Angles are radians, clockwise from 12 o'clock. */

export type Pt = [number, number];

const dir = (a: number): Pt => [Math.sin(a), -Math.cos(a)];
/** Perpendicular to the ray at angle a, pointing toward larger angles (clockwise). */
const perp = (a: number): Pt => [Math.cos(a), Math.sin(a)];

/** A point at distance u along the ray at angle a, and v sideways toward larger angles. */
export function pointAt(cx: number, cy: number, a: number, u: number, v: number): Pt {
  const d = dir(a);
  const p = perp(a);
  return [cx + u * d[0] + v * p[0], cy + u * d[1] + v * p[1]];
}

export interface Fillets {
  /** The corner radius actually used, shrunk if the section is too small for the one asked for. */
  rc: number;
  /** Along-the-ray distance where each fillet meets the straight edge. */
  uOuter: number;
  uInner: number;
  /** Angular offset, from the edge, of where each fillet meets its circle. */
  phiOuter: number;
  phiInner: number;
}

/**
 * Fillet circles for the four corners. Each is tangent to a straight edge (offset by `gap` from the true
 * radial line) and to the outer circle from inside, or to the inner circle from outside.
 */
export function fillets(
  r0: number,
  r1: number,
  theta: number,
  gap: number,
  rcWanted: number,
): Fillets {
  let rc = Math.max(0, Math.min(rcWanted, (r1 - r0) / 2 - 0.5));
  for (let i = 0; i < 40; i++) {
    const v = gap + rc;
    const okOuter = (r1 - rc) ** 2 - v ** 2 > 0;
    const okInner = (r0 + rc) ** 2 - v ** 2 > 0;
    if (okOuter && okInner) {
      const uo = Math.sqrt((r1 - rc) ** 2 - v ** 2);
      const ui = Math.sqrt((r0 + rc) ** 2 - v ** 2);
      // The start and end fillets must not run into each other across the section.
      if (Math.atan2(v, ui) <= theta / 2 - 0.001 && Math.atan2(v, uo) <= theta / 2 - 0.001) {
        return {
          rc,
          uOuter: uo,
          uInner: ui,
          phiOuter: Math.atan2(v, uo),
          phiInner: Math.atan2(v, ui),
        };
      }
    }
    rc *= 0.9;
  }
  return {
    rc: 0,
    uOuter: Math.sqrt(r1 ** 2 - gap ** 2),
    uInner: Math.sqrt(r0 ** 2 - gap ** 2),
    phiOuter: Math.asin(gap / r1),
    phiInner: Math.asin(gap / r0),
  };
}

const f = (n: number): string => n.toFixed(2);
const fmt = (p: Pt): string => `${f(p[0])} ${f(p[1])}`;

/**
 * SVG path for one pie section of a ring: outer arc, inner arc, two straight edges with a `gap`
 * between neighbours, and `rc`-radius fillets on all four corners.
 */
export function roundedSectorPath(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
  gap: number,
  rcWanted: number,
): string {
  const theta = a1 - a0;
  const fl = fillets(r0, r1, theta, gap, rcWanted);
  const polar = (r: number, a: number): Pt => pointAt(cx, cy, a, r, 0);
  const large = theta - fl.phiOuter * 2 > Math.PI ? 1 : 0;
  const rc = fl.rc;
  const parts = [
    `M ${fmt(polar(r1, a0 + fl.phiOuter))}`,
    `A ${f(r1)} ${f(r1)} 0 ${large} 1 ${fmt(polar(r1, a1 - fl.phiOuter))}`,
  ];
  if (rc > 0) {
    parts.push(`A ${f(rc)} ${f(rc)} 0 0 1 ${fmt(pointAt(cx, cy, a1, fl.uOuter, -gap))}`);
    parts.push(`L ${fmt(pointAt(cx, cy, a1, fl.uInner, -gap))}`);
    parts.push(`A ${f(rc)} ${f(rc)} 0 0 1 ${fmt(polar(r0, a1 - fl.phiInner))}`);
  } else {
    parts.push(`L ${fmt(polar(r0, a1 - fl.phiInner))}`);
  }
  parts.push(`A ${f(r0)} ${f(r0)} 0 ${large} 0 ${fmt(polar(r0, a0 + fl.phiInner))}`);
  if (rc > 0) {
    parts.push(`A ${f(rc)} ${f(rc)} 0 0 1 ${fmt(pointAt(cx, cy, a0, fl.uInner, gap))}`);
    parts.push(`L ${fmt(pointAt(cx, cy, a0, fl.uOuter, gap))}`);
    parts.push(`A ${f(rc)} ${f(rc)} 0 0 1 ${fmt(polar(r1, a0 + fl.phiOuter))}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/** Where a label sits: a little outside the middle of the ring, where sections are widest. */
export function labelPoint(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
): Pt {
  return pointAt(cx, cy, (a0 + a1) / 2, r0 + (r1 - r0) * 0.56, 0);
}
