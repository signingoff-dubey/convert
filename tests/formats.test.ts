import { describe, expect, it } from 'vitest';
import {
  CONVERT_TARGETS,
  EXTENSIONS,
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
  it('shows at most 8 wedges once the source format is removed', () => {
    for (const [category, targets] of Object.entries(CONVERT_TARGETS)) {
      expect(targets.length, category).toBeLessThanOrEqual(9);
    }
    for (const tools of Object.values(TOOLS)) expect(tools.length).toBeLessThanOrEqual(8);
    expect(actionsFor([f('a.png')]).length).toBe(7);
  });
  it('never exceeds 8 wedges for any real source file', () => {
    const everyExt = Object.values(EXTENSIONS).flat();
    for (const ext of everyExt) {
      const r = targetsFor([f(`a.${ext}`)], { officeAvailable: true, heicEncoder: true });
      if (r.status === 'ok') expect(r.items.length, ext).toBeLessThanOrEqual(8);
    }
  });
});

describe('targetsFor', () => {
  it('never offers the source format', () => {
    expect(ids(targetsFor([f('a.png')]))).toEqual(['jpg', 'webp', 'tiff', 'avif', 'bmp', 'pdf']);
    expect(ids(targetsFor([f('a.jpeg')]))).not.toContain('jpg');
  });
  it('offers HEIC input every image target except HEIC, which needs an encoder', () => {
    expect(ids(targetsFor([f('a.heic')]))).toHaveLength(7);
    expect(ids(targetsFor([f('a.png')]))).not.toContain('heic');
    expect(ids(targetsFor([f('a.png')], { officeAvailable: false, heicEncoder: true }))).toContain(
      'heic',
    );
  });
  it('treats SVG as an image input', () => {
    expect(ids(targetsFor([f('logo.svg')]))).toContain('png');
  });
  it('adds slides, epub and extra PDF targets', () => {
    expect(ids(targetsFor([f('a.pdf')], { officeAvailable: true }))).toEqual([
      'docx',
      'pptx',
      'xlsx',
      'jpg',
      'png',
      'epub',
      'txt',
      'md',
    ]);
    expect(ids(targetsFor([f('a.pdf')]))).toEqual(['xlsx', 'jpg', 'png', 'epub', 'txt', 'md']);
    expect(ids(targetsFor([f('deck.pptx')], { officeAvailable: true }))).toEqual([
      'pdf',
      'jpg',
      'png',
    ]);
    expect(ids(targetsFor([f('deck.pptx')]))).toEqual([]);
    expect(ids(targetsFor([f('book.epub')]))).toEqual(['docx', 'md', 'txt', 'html']);
    expect(ids(targetsFor([f('t.xls')], { officeAvailable: true }))).toContain('xlsx');
  });
  it('intersects targets across same-category files', () => {
    expect(ids(targetsFor([f('a.png'), f('b.jpg')]))).toEqual([
      'webp',
      'tiff',
      'avif',
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
    expect(ids(targetsFor([f('a.mov')]))).toEqual([
      'mp4',
      'mkv',
      'webm',
      'avi',
      'wmv',
      'gif',
      'mp3',
    ]);
  });
});

describe('toolsFor', () => {
  it('offers the seven image editors for a single image and Collage for several', () => {
    const one = toolsFor([f('a.png')]);
    expect(one.status === 'ok' && one.items.map((x) => x.id)).toEqual([
      'compress',
      'redact',
      'metadata',
      'edit',
      'crop',
      'add-bg',
      'annotate',
    ]);
    const many = toolsFor([f('a.png'), f('b.png')]);
    expect(many.status === 'ok' && many.items.map((x) => x.id)).toEqual(['compress', 'collage']);
  });
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
    expect(actionsFor([f('d', true), f('a.mp3')])).toHaveLength(7);
    expect(actionsFor([])).toHaveLength(0);
  });
});

import { itemsFromMimeTypes } from '../src/shared/formats';

describe('itemsFromMimeTypes', () => {
  it('maps drag MIME types to the same wedges the real extension would give', () => {
    const items = itemsFromMimeTypes(['audio/wav']);
    expect(ids(targetsFor(items))).toEqual(['mp3', 'm4a', 'flac', 'ogg', 'opus', 'aiff', 'wma']);
  });
  it('treats empty and unknown MIME types as unknown, so Convert and Tools disable', () => {
    expect(targetsFor(itemsFromMimeTypes(['']))).toMatchObject({
      status: 'disabled',
      reason: 'unknown-type',
    });
    expect(toolsFor(itemsFromMimeTypes(['application/x-weird']))).toMatchObject({
      status: 'disabled',
    });
    expect(actionsFor(itemsFromMimeTypes(['']))).toHaveLength(7);
  });
});
