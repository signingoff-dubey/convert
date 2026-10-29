export interface WheelGeometry {
  center: { x: number; y: number };
  innerRadius: number;
  outerRadius: number;
  wedgeCount: number;
}

export type HitResult = { kind: 'hole' } | { kind: 'outside' } | { kind: 'wedge'; index: number };

/**
 * Angle math, not DOM events (docs/02 section 6). Wedge 0 starts at 12 o'clock and wedges run
 * clockwise, so wedge i covers [i, i+1) * (360 / count) degrees.
 */
export function hitTest(point: { x: number; y: number }, wheel: WheelGeometry): HitResult {
  const dx = point.x - wheel.center.x;
  const dy = point.y - wheel.center.y;
  const radius = Math.hypot(dx, dy);
  if (radius < wheel.innerRadius) return { kind: 'hole' };
  if (radius > wheel.outerRadius || wheel.wedgeCount <= 0) return { kind: 'outside' };
  // Screen y grows downward, so -dy points up; atan2(dx, -dy) is clockwise from 12 o'clock.
  const angle = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
  const index = Math.min(
    Math.floor((angle / (2 * Math.PI)) * wheel.wedgeCount),
    wheel.wedgeCount - 1,
  );
  return { kind: 'wedge', index };
}
