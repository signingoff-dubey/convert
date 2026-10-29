import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterAll, describe, expect, it } from 'vitest';
import { buildEpub, readEpub, splitChapters, toXhtml } from '../src/main/engines/epub';

const dir = mkdtempSync(join(tmpdir(), 'convert-epub-'));
afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));

describe('epub', () => {
  it('writes a spec-shaped container with mimetype first and uncompressed', async () => {
    const buf = await buildEpub({
      title: 'Book & Co',
      chapters: [{ title: 'One', html: '<h1>One</h1><p>Hi<br>there</p>' }],
    });
    expect(buf.subarray(30, 30 + 8).toString()).toBe('mimetype');
    expect(buf.includes('application/epub+zip')).toBe(true);
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files)[0]).toBe('mimetype');
    expect(await zip.file('OEBPS/content.opf')?.async('string')).toContain(
      '<dc:title>Book &amp; Co</dc:title>',
    );
    expect(await zip.file('OEBPS/chapter1.xhtml')?.async('string')).toContain('<br/>');
  });
  it('round-trips chapters in spine order', async () => {
    const path = join(dir, 'b.epub');
    writeFileSync(
      path,
      await buildEpub({
        title: 'T',
        chapters: [
          { title: 'A', html: '<h1>A</h1><p>first</p>' },
          { title: 'B', html: '<h1>B</h1><p>second</p>' },
        ],
      }),
    );
    const parsed = await readEpub(path);
    expect(parsed.title).toBe('T');
    expect(parsed.html.indexOf('first')).toBeLessThan(parsed.html.indexOf('second'));
  });
  it('rejects things that are not epubs', async () => {
    const path = join(dir, 'bad.epub');
    writeFileSync(path, 'nope');
    await expect(readEpub(path)).rejects.toMatchObject({ code: 'E_CORRUPT_INPUT' });
    const empty = join(dir, 'empty.epub');
    writeFileSync(
      empty,
      await new JSZip().file('x.txt', 'x').generateAsync({ type: 'nodebuffer' }),
    );
    await expect(readEpub(empty)).rejects.toMatchObject({ code: 'E_CORRUPT_INPUT' });
  });
  it('splits on h1 and makes XHTML-safe markup', () => {
    expect(splitChapters('<h1>A</h1>x<h1>B</h1>y', 'T').map((c) => c.title)).toEqual(['A', 'B']);
    expect(splitChapters('<p>only</p>', 'Doc')).toEqual([{ title: 'Doc', html: '<p>only</p>' }]);
    expect(toXhtml('a<br>b&nbsp;&amp;&c')).toBe('a<br/>b&#160;&amp;&amp;c');
  });
});
