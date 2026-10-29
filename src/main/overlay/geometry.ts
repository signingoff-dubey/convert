import type { Point } from '../trigger/state-machine';
import type { Rect } from './dpi';

export const WHEEL_DIAMETER = { s: 220, m: 280, l: 340 } as const;
export type WheelSize = keyof typeof WHEEL_DIAMETER;

export const OVERLAY_PADDING = 16;

export interface OverlayPlacement {
  /** Window rectangle in DIPs. */
  window: Rect;
  /** Wheel center in window-local DIPs. Equals the window center unless the window was clamped. */
  wheelCenter: Point;
  /** False when clamping pushed the cursor out of the neutral hole. */
  cursorInHole: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Centers the wheel on the cursor and clamps the window into the monitor's work area. */
export function placeOverlay(
  cursorDip: Point,
  size: WheelSize,
  workArea: Rect,
  holeRadius = 0.25 * WHEEL_DIAMETER[size],
): OverlayPlacement {
  const side = WHEEL_DIAMETER[size] + OVERLAY_PADDING * 2;
  const x = clamp(
    Math.round(cursorDip.x - side / 2),
    workArea.x,
    workArea.x + workArea.width - side,
  );
  const y = clamp(
    Math.round(cursorDip.y - side / 2),
    workArea.y,
    workArea.y + workArea.height - side,
  );
  const wheelCenter = { x: side / 2, y: side / 2 };
  const cursorLocal = { x: cursorDip.x - x, y: cursorDip.y - y };
  return {
    window: { x, y, width: side, height: side },
    wheelCenter,
    cursorInHole:
      Math.hypot(cursorLocal.x - wheelCenter.x, cursorLocal.y - wheelCenter.y) <= holeRadius,
  };
}
