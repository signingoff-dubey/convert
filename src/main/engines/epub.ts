import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { JobError } from '../jobs/types';

export interface EpubChapter {
  title: string;
  /** Body HTML (XHTML-safe). */
  html: string;
}

export interface EpubInput {
  title: string;
  author?: string;
  language?: string;
  chapters: EpubChapter[];
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const xhtml = (title: string, body: string): string =>
  `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>
${body}
</body></html>`;

/** Turns loose HTML into well-formed XHTML: void tags self-close, entities stay valid. */
export function toXhtml(html: string): string {
  return html
    .replace(/<(br|hr|img|input|meta|link)([^>]*?)\s*\/?>/gi, '<$1$2/>')
    .replace(/&nbsp;/g, '&#160;')
    .replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;');
}

/** Splits at top-level <h1> headings. Without any, the whole document is one chapter. */
export function splitChapters(html: string, fallbackTitle: string): EpubChapter[] {
  const parts = html.split(/(?=<h1[\s>])/i).filter((p) => p.trim() !== '');
  if (parts.length === 0) return [{ title: fallbackTitle, html: '<p></p>' }];
  return parts.map((part, i) => {
    const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(part);
    const title = m
      ? m[1]?.replace(/<[^>]+>/g, '').trim() || fallbackTitle
      : i === 0
        ? fallbackTitle
        : `Part ${i + 1}`;
    return { title, html: part };
  });
}

/** Builds a valid EPUB 3 container. The mimetype entry is first and stored uncompressed, per the spec. */
export async function buildEpub(input: EpubInput): Promise<Buffer> {
  const zip = new JSZip();
  const id = `urn:uuid:${crypto.randomUUID()}`;
  const lang = input.language ?? 'en';
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  const files = input.chapters.map((_, i) => `chapter${i + 1}.xhtml`);
  input.chapters.forEach((c, i) => zip.file(`OEBPS/${files[i]}`, xhtml(c.title, toXhtml(c.html))));
  zip.file(
    'OEBPS/style.css',
    'body{font-family:serif;line-height:1.5;margin:1em}pre{white-space:pre-wrap}img{max-width:100%}',
  );
  zip.file(
    'OEBPS/nav.xhtml',
    xhtml(
      input.title,
      `<nav epub:type="toc"><h1>Contents</h1><ol>${input.chapters
        .map((c, i) => `<li><a href="${files[i]}">${esc(c.title)}</a></li>`)
        .join('')}</ol></nav>`,
    ),
  );
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${id}</dc:identifier><dc:title>${esc(input.title)}</dc:title><dc:language>${lang}</dc:language>${
      input.author ? `<dc:creator>${esc(input.author)}</dc:creator>` : ''
    }<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${files
      .map((f, i) => `<item id="c${i + 1}" href="${f}" media-type="application/xhtml+xml"/>`)
      .join(
        '',
      )}</manifest><spine>${files.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('')}</spine></package>`,
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export interface ParsedEpub {
  title: string;
  html: string;
}

/** Reads the spine in order and joins each document's body. Images are dropped. */
export async function readEpub(path: string): Promise<ParsedEpub> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await readFile(path));
  } catch (error) {
    throw new JobError('E_CORRUPT_INPUT', error instanceof Error ? error.message : 'epub');
  }
  const container = await zip.file('META-INF/container.xml')?.async('string');
  const opfPath = container ? /full-path="([^"]+)"/.exec(container)?.[1] : undefined;
  const opf = opfPath ? await zip.file(opfPath)?.async('string') : undefined;
  if (!opfPath || !opf) throw new JobError('E_CORRUPT_INPUT', 'not an EPUB (no package document)');
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const manifest = new Map<string, string>();
  for (const m of opf.matchAll(/<item\b[^>]*>/g)) {
    const id = /\bid="([^"]+)"/.exec(m[0])?.[1];
    const href = /\bhref="([^"]+)"/.exec(m[0])?.[1];
    if (id && href) manifest.set(id, decodeURIComponent(href));
  }
  const title = /<dc:title[^>]*>([\s\S]*?)<\/dc:title>/.exec(opf)?.[1]?.trim() ?? 'Untitled';
  const bodies: string[] = [];
  for (const ref of opf.matchAll(/<itemref\b[^>]*\bidref="([^"]+)"/g)) {
    const href = manifest.get(ref[1] ?? '');
    const text = href ? await zip.file(base + href)?.async('string') : undefined;
    if (!text) continue;
    const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(text)?.[1] ?? text;
    bodies.push(body.replace(/<img[^>]*>/gi, ''));
  }
  if (bodies.length === 0) throw new JobError('E_CORRUPT_INPUT', 'EPUB has no readable chapters');
  return { title, html: bodies.join('\n') };
}
