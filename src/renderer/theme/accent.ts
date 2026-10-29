export type Rgb = [number, number, number];

export interface DerivedAccent {
  accent: string;
  accentHover: string;
  /** Accent at 16% alpha, for backgrounds. */
  accentSoft: string;
  onAccent: '#000000' | '#FFFFFF';
}

export const MIN_CONTRAST = 4.5;

export function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) throw new Error(`Invalid hex colour: ${hex}`);
  const n = parseInt(m[1] as string, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const part = (v: number): string =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]: [number, number, number]): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor((((h % 360) + 360) % 360) / 60);
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector] as Rgb;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function shiftLightness(hex: string, delta: number): string {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h, s, Math.min(1, Math.max(0, l + delta))]));
}

function bestOn(accent: string): { color: '#000000' | '#FFFFFF'; ratio: number } {
  const black = contrastRatio(accent, '#000000');
  const white = contrastRatio(accent, '#FFFFFF');
  return black >= white ? { color: '#000000', ratio: black } : { color: '#FFFFFF', ratio: white };
}

/**
 * Derives the accent family (docs/03 section 4). The label colour is black or white, whichever
 * contrasts more; if that is still under 4.5:1 the accent's lightness is nudged until it passes.
 */
export function deriveAccent(accentHex: string, darkTheme: boolean): DerivedAccent {
  let accent = accentHex.toUpperCase();
  for (let i = 0; i < 40 && bestOn(accent).ratio < MIN_CONTRAST; i++) {
    const lightnessNow = rgbToHsl(hexToRgb(accent))[2];
    accent = shiftLightness(accent, lightnessNow < 0.5 ? -0.02 : 0.02);
  }
  const [r, g, b] = hexToRgb(accent);
  return {
    accent,
    accentHover: shiftLightness(accent, darkTheme ? 0.08 : -0.08),
    accentSoft: `rgba(${r}, ${g}, ${b}, 0.16)`,
    onAccent: bestOn(accent).color,
  };
}
