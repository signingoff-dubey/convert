/** Pure layout and parameter maths for the image editors. Shared by the preview UIs and the sharp engines. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Ratio = 'auto' | '1:1' | '4:3' | '3:2' | '16:9' | '9:16' | '4:5';

const RATIOS: Record<Exclude<Ratio, 'auto'>, number> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '4:5': 4 / 5,
};

export const MAX_SIDE = 8000;

export function ratioValue(ratio: Ratio): number | null {
  return ratio === 'auto' ? null : RATIOS[ratio];
}

export interface BgLayout {
  canvasW: number;
  canvasH: number;
  photo: Rect;
}

/** Canvas for "Add BG": the photo plus padding, grown to the chosen aspect ratio and centered. */
export function bgLayout(w: number, h: number, ratio: Ratio, padPercent: number): BgLayout {
  const pad = Math.max(0, Math.min(50, padPercent)) / 100;
  const p = Math.max(w, h) * pad;
  const contentW = w + 2 * p;
  const contentH = h + 2 * p;
  const r = ratioValue(ratio);
  let canvasW = contentW;
  let canvasH = contentH;
  if (r !== null) {
    if (contentW / contentH > r) canvasH = contentW / r;
    else canvasW = contentH * r;
  }
  let scale = 1;
  if (Math.max(canvasW, canvasH) > MAX_SIDE) scale = MAX_SIDE / Math.max(canvasW, canvasH);
  const cw = Math.max(1, Math.round(canvasW * scale));
  const ch = Math.max(1, Math.round(canvasH * scale));
  const pw = Math.max(1, Math.round(w * scale));
  const ph = Math.max(1, Math.round(h * scale));
  return {
    canvasW: cw,
    canvasH: ch,
    photo: { x: Math.round((cw - pw) / 2), y: Math.round((ch - ph) / 2), w: pw, h: ph },
  };
}

export type CollageStyle = 'grid' | 'row' | 'column' | 'featured';

export interface CollageLayout {
  width: number;
  height: number;
  cells: Rect[];
}

/**
 * Cells for a collage. `aspects` are width/height of each image in the given order.
 * Row and column keep every image's own proportions; grid and featured crop to fill their cells.
 */
export function collageLayout(
  style: CollageStyle,
  aspects: readonly number[],
  width: number,
  spacing: number,
): CollageLayout {
  const n = aspects.length;
  const s = Math.max(0, Math.round(spacing));
  const W = Math.max(64, Math.round(width));
  if (n === 0) return { width: W, height: W, cells: [] };

  if (style === 'row') {
    const total = aspects.reduce((a, b) => a + b, 0);
    const h = (W - s * (n + 1)) / total;
    let x = s;
    const cells = aspects.map((a) => {
      const cell = { x: Math.round(x), y: s, w: Math.round(h * a), h: Math.round(h) };
      x += h * a + s;
      return cell;
    });
    return { width: W, height: Math.round(h) + 2 * s, cells };
  }

  if (style === 'column') {
    const w = W - 2 * s;
    let y = s;
    const cells = aspects.map((a) => {
      const hh = w / a;
      const cell = { x: s, y: Math.round(y), w, h: Math.round(hh) };
      y += hh + s;
      return cell;
    });
    return { width: W, height: Math.round(y), cells };
  }

  if (style === 'featured' && n > 1) {
    const H = Math.round((W * 2) / 3);
    const bigW = Math.round((W - 3 * s) * 0.62);
    const sideW = W - 3 * s - bigW;
    const count = n - 1;
    const sideH = (H - s * (count + 1)) / count;
    const cells: Rect[] = [{ x: s, y: s, w: bigW, h: H - 2 * s }];
    for (let i = 0; i < count; i++) {
      cells.push({
        x: 2 * s + bigW,
        y: Math.round(s + i * (sideH + s)),
        w: sideW,
        h: Math.round(sideH),
      });
    }
    return { width: W, height: H, cells };
  }

  // Grid: square cells.
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cell = Math.floor((W - s * (cols + 1)) / cols);
  const cells: Rect[] = aspects.map((_, i) => ({
    x: s + (i % cols) * (cell + s),
    y: s + Math.floor(i / cols) * (cell + s),
    w: cell,
    h: cell,
  }));
  return { width: W, height: rows * cell + s * (rows + 1), cells };
}

export interface CropInput {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Clamps a crop box into the image and rounds to whole pixels. Returns null if nothing is left. */
export function clampCrop(c: CropInput, imageW: number, imageH: number): CropInput | null {
  const left = Math.max(0, Math.min(imageW - 1, Math.round(c.left)));
  const top = Math.max(0, Math.min(imageH - 1, Math.round(c.top)));
  const width = Math.min(imageW - left, Math.round(c.width));
  const height = Math.min(imageH - top, Math.round(c.height));
  return width >= 1 && height >= 1 ? { left, top, width, height } : null;
}

/** Largest box of the given aspect ratio that fits the image, centered. Used when a ratio preset is chosen. */
export function fitRatioBox(imageW: number, imageH: number, ratio: number): CropInput {
  let width = imageW;
  let height = Math.round(width / ratio);
  if (height > imageH) {
    height = imageH;
    width = Math.round(height * ratio);
  }
  return {
    left: Math.round((imageW - width) / 2),
    top: Math.round((imageH - height) / 2),
    width,
    height,
  };
}

export interface EditParams {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  sharpen: number;
  blur: number;
  grayscale: boolean;
  sepia: boolean;
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

export const DEFAULT_EDIT: EditParams = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  sharpen: 0,
  blur: 0,
  grayscale: false,
  sepia: false,
  rotate: 0,
  flipH: false,
  flipV: false,
};

const clampNum = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

/** Reads untrusted tool-window parameters into a safe, fully-populated EditParams. */
export function parseEditParams(
  raw: Record<string, string | number | boolean | undefined>,
): EditParams {
  const rotate = clampNum(raw.rotate, 0, 360, 0);
  const snapped = ((Math.round(rotate / 90) * 90) % 360) as 0 | 90 | 180 | 270;
  return {
    exposure: clampNum(raw.exposure, -100, 100, 0),
    contrast: clampNum(raw.contrast, -100, 100, 0),
    saturation: clampNum(raw.saturation, -100, 100, 0),
    temperature: clampNum(raw.temperature, -100, 100, 0),
    sharpen: clampNum(raw.sharpen, 0, 100, 0),
    blur: clampNum(raw.blur, 0, 20, 0),
    grayscale: raw.grayscale === true || raw.grayscale === 'true',
    sepia: raw.sepia === true || raw.sepia === 'true',
    rotate: snapped,
    flipH: raw.flipH === true || raw.flipH === 'true',
    flipV: raw.flipV === true || raw.flipV === 'true',
  };
}

export function isIdentityEdit(e: EditParams): boolean {
  return JSON.stringify(e) === JSON.stringify(DEFAULT_EDIT);
}

/** CSS filter string for the live preview. The engine uses sharp, so the match is close, not exact. */
export function editToCssFilter(e: EditParams): string {
  const parts = [
    `brightness(${(2 ** (e.exposure / 100)).toFixed(3)})`,
    `contrast(${(1 + e.contrast / 100).toFixed(3)})`,
    `saturate(${(1 + e.saturation / 100).toFixed(3)})`,
  ];
  if (e.blur > 0) parts.push(`blur(${e.blur}px)`);
  if (e.grayscale) parts.push('grayscale(1)');
  if (e.sepia) parts.push('sepia(1)');
  return parts.join(' ');
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Parses the JSON box list sent by the Redact window. Anything malformed is dropped, not trusted. */
export function parseBoxes(json: unknown, imageW: number, imageH: number, limit = 500): Box[] {
  if (typeof json !== 'string' || json.length > 200_000) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: Box[] = [];
  for (const item of raw.slice(0, limit)) {
    if (typeof item !== 'object' || item === null) continue;
    const { x, y, w, h } = item as Record<string, unknown>;
    if (![x, y, w, h].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
    const left = Math.max(0, Math.round(x as number));
    const top = Math.max(0, Math.round(y as number));
    const width = Math.min(imageW - left, Math.round(w as number));
    const height = Math.min(imageH - top, Math.round(h as number));
    if (width >= 1 && height >= 1) out.push({ x: left, y: top, w: width, h: height });
  }
  return out;
}

export const HEX = /^#[0-9a-fA-F]{6}$/;
