import { describe, expect, it } from 'vitest';
import {
  CONVERT_TARGETS,
  TOOLS,
  actionsFor,
  categoryOf,
  extensionOf,
  targetsFor,
  toolsFor,
} from '../src/shared/formats';

const f = (path: string, isDirectory = false) => ({ path, isDirectory });
const ids = (r: ReturnType<typeof targetsFor>) =>
  r.status === 'ok' ? r.items.map((i) => i.id) : [];

describe('extensionOf / categoryOf', () => {
  it('handles case, aliases, dotfiles and Windows paths', () => {
    expect(extensionOf('C:\\a\\b\\Photo.JPEG')).toBe('jpg');
    expect(extensionOf('x.tif')).toBe('tiff');
    expect(extensionOf('.gitignore')).toBe('');
    expect(extensionOf('noext')).toBe('');
    expect(extensionOf('trailing.')).toBe('');
    expect(categoryOf('a.HEIC')).toBe('image');
    expect(categoryOf('a.xyz')).toBeNull();
  });
});

describe('wheel limits', () => {
  it('has at most 7 wedges per wheel', () => {
    for (const targets of Object.values(CONVERT_TARGETS))
      expect(targets.length).toBeLessThanOrEqual(7);
    for (const tools of Object.values(TOOLS)) expect(tools.length).toBeLessThanOrEqual(7);
    expect(actionsFor([f('a.png')]).length).toBe(6);
  });
});

describe('targetsFor', () => {
  it('never offers the source format', () => {
    expect(ids(targetsFor([f('a.png')]))).toEqual(['jpg', 'webp', 'avif', 'tiff', 'bmp', 'pdf']);
    expect(ids(targetsFor([f('a.jpeg')]))).not.toContain('jpg');
  });
  it('offers HEIC input every image target', () => {
    expect(ids(targetsFor([f('a.heic')]))).toHaveLength(7);
  });
  it('intersects targets across same-category files', () => {
    expect(ids(targetsFor([f('a.png'), f('b.jpg')]))).toEqual([
      'webp',
      'avif',
      'tiff',
      'bmp',
      'pdf',
    ]);
  });
  it('disables mixed categories, folders, unknown and empty', () => {
    const mixed = targetsFor([f('a.png'), f('b.mp3')]);
    expect(mixed).toMatchObject({
      status: 'disabled',
      reason: 'mixed-categories',
      hint: 'Select one type',
    });
    expect(targetsFor([f('dir', true)])).toMatchObject({ status: 'disabled', reason: 'folder' });
    expect(targetsFor([f('a.xyz')])).toMatchObject({ status: 'disabled', reason: 'unknown-type' });
    expect(targetsFor([f('a.png'), f('b.xyz')])).toMatchObject({ reason: 'mixed-categories' });
    expect(targetsFor([])).toMatchObject({ status: 'disabled', reason: 'empty' });
  });
  it('hides Office-only wedges unless the Office engine exists', () => {
    expect(ids(targetsFor([f('a.docx')]))).not.toContain('pdf');
    expect(ids(targetsFor([f('a.md')], { officeAvailable: true }))).toContain('pdf');
  });
  it('video offers audio extraction', () => {
    expect(ids(targetsFor([f('a.mov')]))).toEqual(['mp4', 'webm', 'mkv', 'gif', 'mp3']);
  });
});

describe('toolsFor', () => {
  it('gates tools by file count', () => {
    const one = toolsFor([f('a.pdf')]);
    const two = toolsFor([f('a.pdf'), f('b.pdf')]);
    expect(one.status === 'ok' && one.items.map((t) => t.id)).toEqual(['compress', 'split']);
    expect(two.status === 'ok' && two.items.map((t) => t.id)).toEqual(['compress', 'merge']);
  });
  it('reports no tools for categories without any', () => {
    expect(toolsFor([f('a.docx')])).toMatchObject({ status: 'disabled', reason: 'no-tools' });
  });
});

describe('actionsFor', () => {
  it('works on folders and mixed selections', () => {
    expect(actionsFor([f('d', true), f('a.mp3')])).toHaveLength(6);
    expect(actionsFor([])).toHaveLength(0);
  });
});

import { itemsFromMimeTypes } from '../src/shared/formats';

describe('itemsFromMimeTypes', () => {
  it('maps drag MIME types to the same wedges the real extension would give', () => {
    const items = itemsFromMimeTypes(['audio/wav']);
    expect(ids(targetsFor(items))).toEqual(['mp3', 'm4a', 'flac', 'ogg', 'opus']);
  });
  it('treats empty and unknown MIME types as unknown, so Convert and Tools disable', () => {
    expect(targetsFor(itemsFromMimeTypes(['']))).toMatchObject({
      status: 'disabled',
      reason: 'unknown-type',
    });
    expect(toolsFor(itemsFromMimeTypes(['application/x-weird']))).toMatchObject({
      status: 'disabled',
    });
    expect(actionsFor(itemsFromMimeTypes(['']))).toHaveLength(6);
  });
});
