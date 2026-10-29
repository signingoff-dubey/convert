import { describe, expect, it } from 'vitest';
import { ACCENT_PRESETS, THEMES, resolveTheme } from '../src/renderer/theme/themes';
import {
  MIN_CONTRAST,
  contrastRatio,
  deriveAccent,
  hexToRgb,
  rgbToHex,
} from '../src/renderer/theme/accent';

describe('colour maths', () => {
  it('round-trips hex and computes known contrast', () => {
    expect(rgbToHex(hexToRgb('#7c5cff'))).toBe('#7C5CFF');
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(() => hexToRgb('red')).toThrow();
  });
});

describe('accent derivation', () => {
  const accents = [
    ...Object.values(ACCENT_PRESETS),
    '#000000',
    '#FFFFFF',
    '#808080',
    '#767676',
    '#777777',
    '#0000FF',
    '#00FF00',
  ];
  for (const [name, theme] of Object.entries(THEMES)) {
    it(`label contrast is at least 4.5:1 for every accent on ${name}`, () => {
      for (const hex of accents) {
        const d = deriveAccent(hex, theme.dark);
        expect(contrastRatio(d.accent, d.onAccent), `${hex} ${name}`).toBeGreaterThanOrEqual(
          MIN_CONTRAST,
        );
      }
    });
  }
  it('lightens hover in dark themes and darkens it in light themes', () => {
    const lum = (hex: string) => contrastRatio(hex, '#000000');
    expect(lum(deriveAccent('#7C5CFF', true).accentHover)).toBeGreaterThan(lum('#7C5CFF'));
    expect(lum(deriveAccent('#7C5CFF', false).accentHover)).toBeLessThan(lum('#7C5CFF'));
  });
  it('builds the soft background at 16% alpha', () => {
    expect(deriveAccent('#7C5CFF', true).accentSoft).toBe('rgba(124, 92, 255, 0.16)');
  });
});

describe('themes', () => {
  it('keeps body and muted text readable on every surface', () => {
    for (const t of Object.values(THEMES)) {
      expect(contrastRatio(t.text, t.surface)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(contrastRatio(t.textMuted, t.surface)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(contrastRatio(t.text, t.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
  it('maps system to graphite or paper', () => {
    expect(resolveTheme('system', true)).toBe('graphite');
    expect(resolveTheme('system', false)).toBe('paper');
    expect(resolveTheme('midnight', false)).toBe('midnight');
  });
});
