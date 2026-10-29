import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ net: {}, protocol: {} }));

describe('preview helpers', async () => {
  const { needsPreviewConversion, previewUrl } = await import('../src/main/protocol');
  it('converts only formats a browser cannot draw', () => {
    expect(needsPreviewConversion('C:\\a\\x.HEIC')).toBe(true);
    expect(needsPreviewConversion('x.tiff')).toBe(true);
    expect(needsPreviewConversion('x.png')).toBe(false);
    expect(needsPreviewConversion('x.jpg')).toBe(false);
  });
  it('encodes the path so it survives a URL', () => {
    const url = previewUrl('C:\\My Files\\a&b #1.png');
    expect(url.startsWith('convert-file://local/')).toBe(true);
    expect(decodeURIComponent(url.split('/local/')[1] as string)).toBe('C:\\My Files\\a&b #1.png');
  });
});
