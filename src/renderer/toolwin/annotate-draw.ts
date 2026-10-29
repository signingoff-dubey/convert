export type ShapeKind = 'arrow' | 'line' | 'rect' | 'ellipse' | 'text' | 'callout';

export interface Shape {
  kind: ShapeKind;
  color: string;
  /** Line width in image pixels. */
  width: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text?: string;
  /** Callout number. */
  n?: number;
}

/** Minimal drawing surface, so the same code runs on a browser canvas and in tests. */
export interface Ctx2D {
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
}

export const calloutRadius = (width: number): number => Math.max(14, width * 3.2);
export const textSize = (width: number): number => Math.max(16, width * 5);

/** Draws one shape. Coordinates and sizes are in image pixels. */
export function drawShape(ctx: Ctx2D, s: Shape): void {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (s.kind) {
    case 'line':
    case 'arrow': {
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      if (s.kind === 'arrow') {
        const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
        const head = Math.max(12, s.width * 4.5);
        ctx.beginPath();
        ctx.moveTo(s.x2, s.y2);
        ctx.lineTo(
          s.x2 - head * Math.cos(angle - Math.PI / 7),
          s.y2 - head * Math.sin(angle - Math.PI / 7),
        );
        ctx.lineTo(
          s.x2 - head * Math.cos(angle + Math.PI / 7),
          s.y2 - head * Math.sin(angle + Math.PI / 7),
        );
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'rect':
      ctx.strokeRect(
        Math.min(s.x1, s.x2),
        Math.min(s.y1, s.y2),
        Math.abs(s.x2 - s.x1),
        Math.abs(s.y2 - s.y1),
      );
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(
        (s.x1 + s.x2) / 2,
        (s.y1 + s.y2) / 2,
        Math.abs(s.x2 - s.x1) / 2,
        Math.abs(s.y2 - s.y1) / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      break;
    case 'text': {
      const size = textSize(s.width);
      ctx.font = `600 ${size}px "Segoe UI", "Inter Variable", system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      // A thin outline keeps the text readable on any photo.
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = Math.max(2, size / 8);
      ctx.strokeText(s.text ?? '', s.x1, s.y1);
      ctx.fillText(s.text ?? '', s.x1, s.y1);
      break;
    }
    case 'callout': {
      const r = calloutRadius(s.width);
      ctx.beginPath();
      ctx.arc(s.x1, s.y1, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${r * 1.15}px "Segoe UI", "Inter Variable", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(s.n ?? 1), s.x1, s.y1 + r * 0.06);
      break;
    }
  }
  ctx.restore();
}

export function drawAll(ctx: Ctx2D, shapes: readonly Shape[]): void {
  for (const s of shapes) drawShape(ctx, s);
}
