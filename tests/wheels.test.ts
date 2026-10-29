import { describe, expect, it } from 'vitest';
import { applyWheelPrefs, wheelKey } from '../src/shared/wheels';

const w = (id: string) => ({ id, label: id.toUpperCase() });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('wheel prefs', () => {
  const defaults = [w('png'), w('jpg'), w('webp'), w('avif')];
  it('keeps default order with no prefs', () => {
    expect(ids(applyWheelPrefs(defaults, undefined, undefined))).toEqual([
      'png',
      'jpg',
      'webp',
      'avif',
    ]);
  });
  it('applies the saved order and puts unknown wedges after it', () => {
    expect(ids(applyWheelPrefs(defaults, ['avif', 'png'], []))).toEqual([
      'avif',
      'png',
      'jpg',
      'webp',
    ]);
  });
  it('hides disabled wedges and ignores stale ids', () => {
    expect(ids(applyWheelPrefs(defaults, ['gone', 'jpg'], ['png', 'gone']))).toEqual([
      'jpg',
      'webp',
      'avif',
    ]);
  });
  it('builds settings keys', () => {
    expect(wheelKey('convert', 'image')).toBe('convert:image');
    expect(wheelKey('actions', 'image')).toBe('actions:all');
    expect(wheelKey('tools', null)).toBe('tools:all');
  });
});
