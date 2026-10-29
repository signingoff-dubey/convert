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
    // The tools wheel holds up to 10 wedges (DEVIATION-4); a single image gets 10 of the 11 image tools.
    for (const tools of Object.values(TOOLS)) expect(tools.length).toBeLessThanOrEqual(11);
    const single = toolsFor([f('a.png')]);
    expect(single.status === 'ok' && single.items.length).toBeLessThanOrEqual(10);
    expect(actionsFor([f('a.png')]).length).toBe(8);
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
    expect(ids(targetsFor([f('a.png')]))).toEqual([
      'jpg',
      'webp',
      'tiff',
      'avif',
      'bmp',
      'pdf',
      'txt',
    ]);
    expect(ids(targetsFor([f('a.jpeg')]))).not.toContain('jpg');
  });
  it('offers HEIC input every image target except HEIC, which needs an encoder', () => {
    expect(ids(targetsFor([f('a.heic')]))).toHaveLength(8);
    expect(ids(targetsFor([f('a.png')]))).not.toContain('heic');
    expect(ids(targetsFor([f('a.png')], { officeAvailable: false, heicEncoder: true }))).toContain(
      'heic',
    );
  });
  it('treats SVG as an image input', () => {
    expect(ids(targetsFor([f('logo.svg')]))).toContain('png');
    expect(ids(targetsFor([f('logo.svg')]))).not.toContain('txt');
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
    expect(ids(targetsFor([f('book.epub')]))).toEqual(['docx', 'md', 'txt', 'html', 'pdf']);
    expect(ids(targetsFor([f('t.xls')], { officeAvailable: true }))).toContain('xlsx');
  });
  it('offers every target at least one file can use, so a mixed batch can go to either format', () => {
    expect(ids(targetsFor([f('a.png'), f('b.jpg')]))).toEqual([
      'png',
      'jpg',
      'webp',
      'tiff',
      'avif',
      'bmp',
      'pdf',
      'txt',
    ]);
    expect(ids(targetsFor([f('a.png'), f('b.png')]))).not.toContain('png');
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
    expect(ids(targetsFor([f('deck.pptx')]))).not.toContain('pdf');
    expect(ids(targetsFor([f('deck.pptx')], { officeAvailable: true }))).toContain('pdf');
    // Markdown, text, HTML, EPUB and Word go to PDF with the built-in renderer, no Office needed.
    expect(ids(targetsFor([f('a.md')]))).toContain('pdf');
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
  it('offers the image tools for a single image and the batch-friendly ones for several', () => {
    const one = toolsFor([f('a.png')]);
    expect(one.status === 'ok' && one.items.map((x) => x.id)).toEqual([
      'compress',
      'redact',
      'metadata',
      'edit',
      'crop',
      'add-bg',
      'annotate',
      'upscale',
      'remove-bg',
      'copy-text',
    ]);
    const many = toolsFor([f('a.png'), f('b.png')]);
    expect(many.status === 'ok' && many.items.map((x) => x.id)).toEqual([
      'compress',
      'collage',
      'upscale',
      'remove-bg',
      'copy-text',
    ]);
  });
  it('gates tools by file count', () => {
    const one = toolsFor([f('a.pdf')]);
    const two = toolsFor([f('a.pdf'), f('b.pdf')]);
    expect(one.status === 'ok' && one.items.map((t) => t.id)).toEqual([
      'compress',
      'split',
      'delete-pages',
      'password',
      'copy-text',
    ]);
    expect(two.status === 'ok' && two.items.map((t) => t.id)).toEqual([
      'compress',
      'merge',
      'copy-text',
    ]);
  });
  it('offers Merge for videos, audio, and only text or Markdown documents', () => {
    const ids_ = (items: ReturnType<typeof f>[]) => {
      const r = toolsFor(items);
      return r.status === 'ok' ? r.items.map((t) => t.id) : [];
    };
    expect(ids_([f('a.mp4'), f('b.mov')])).toContain('merge');
    expect(ids_([f('a.mp3'), f('b.wav')])).toContain('merge');
    expect(ids_([f('a.txt'), f('b.md')])).toContain('merge');
    expect(ids_([f('a.docx'), f('b.docx')])).not.toContain('merge');
    expect(ids_([f('a.mp4')])).not.toContain('merge');
  });
  it('offers Password for a single ZIP only', () => {
    expect(toolsFor([f('a.zip')])).toMatchObject({ status: 'ok' });
    expect(toolsFor([f('a.tar')])).toMatchObject({ status: 'disabled' });
    expect(toolsFor([f('a.zip'), f('b.zip')])).toMatchObject({ status: 'disabled' });
  });
  it('reports no tools for categories without any', () => {
    expect(toolsFor([f('deck.pptx')])).toMatchObject({ status: 'disabled', reason: 'no-tools' });
  });
});

describe('actionsFor', () => {
  it('works on folders and mixed selections', () => {
    expect(actionsFor([f('d', true), f('a.mp3')])).toHaveLength(8);
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
    expect(actionsFor(itemsFromMimeTypes(['']))).toHaveLength(8);
  });
});
