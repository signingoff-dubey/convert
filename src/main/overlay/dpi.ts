import type { Point } from '../trigger/state-machine';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A monitor as Electron describes it: DIP bounds, physical bounds, and a scale factor. */
export interface DisplayInfo {
  bounds: Rect;
  physicalBounds: Rect;
  scaleFactor: number;
}

function contains(rect: Rect, p: Point): boolean {
  return p.x >= rect.x && p.x < rect.x + rect.width && p.y >= rect.y && p.y < rect.y + rect.height;
}

function distanceToRect(rect: Rect, p: Point): number {
  const dx = Math.max(rect.x - p.x, 0, p.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - p.y, 0, p.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

/**
 * Pure model of Electron's screen.screenToDipPoint: pick the monitor under the physical point
 * (nearest if none), then scale the offset from that monitor's physical origin.
 */
export function physicalToDip(point: Point, displays: readonly DisplayInfo[]): Point {
  const first = displays[0];
  if (first === undefined) return point;
  const display =
    displays.find((d) => contains(d.physicalBounds, point)) ??
    displays.reduce((best, d) =>
      distanceToRect(d.physicalBounds, point) < distanceToRect(best.physicalBounds, point)
        ? d
        : best,
    );
  return {
    x: display.bounds.x + (point.x - display.physicalBounds.x) / display.scaleFactor,
    y: display.bounds.y + (point.y - display.physicalBounds.y) / display.scaleFactor,
  };
}
