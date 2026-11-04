import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EXTENSIONS } from '../../shared/formats';
import { sanitizeName, uniqueSibling } from '../jobs/naming';
import { logger } from './log';

const log = logger('webdrop');

/** One thing dragged out of a browser: the picture's bytes when the browser gave them, otherwise its address. */
export interface WebItem {
  name?: string;
  mime?: string;
  data?: Uint8Array;
  url?: string;
}

export interface WebFetchResult {
  ok: boolean;
  /** Address after redirects. */
  url: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface WebDropDeps {
  /** The folder the files are saved in, normally Downloads. */
  dir: string;
  fetch(url: string): Promise<WebFetchResult>;
  exists?(p: string): boolean;
}

export const MAX_WEB_BYTES = 150 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
};

const KNOWN = new Set(Object.values(EXTENSIONS).flat());

/** Loopback, private and link-local addresses, and names that only mean something on a local network. */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  )
    return true;
  if (!h.includes('.') && !h.includes(':')) return true; // a bare name such as "router"
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (h.includes(':')) return h === '::1' || h === '::' || /^f[cd]/.test(h) || h.startsWith('fe80');
  return false;
}

/** http or https to a public host, or an inline data: picture. */
export function isFetchable(raw: string): boolean {
  if (/^data:image\//i.test(raw)) return true;
  try {
    const u = new URL(raw);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !isPrivateHost(u.hostname);
  } catch {
    return false;
  }
}

function decodeDataUrl(raw: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:([^;,]+)((?:;[^;,]+)*),(.*)$/is.exec(raw);
  if (!m) return null;
  const base64 = /;base64/i.test(m[2] ?? '');
  const body = m[3] ?? '';
  try {
    const buf = base64
      ? Buffer.from(body, 'base64')
      : Buffer.from(decodeURIComponent(body), 'utf8');
    return { mime: (m[1] ?? '').toLowerCase(), bytes: buf };
  } catch {
    return null;
  }
}

/** The file name to save under: the browser's own name, else the last part of the address, else "image". */
export function nameFor(item: WebItem, urlForName: string | undefined, mime: string): string {
  // A web page is not a file to convert, whatever it is called.
  if (/^(text\/html|application\/xhtml)/i.test(mime)) return '';
  let raw = item.name ?? '';
  if (raw === '' && urlForName && !urlForName.startsWith('data:')) {
    try {
      raw = decodeURIComponent(path.posix.basename(new URL(urlForName).pathname));
    } catch {
      raw = '';
    }
  }
  const last = raw.split(/[\\/]/).pop() ?? '';
  const base = last === '' ? 'image' : sanitizeName(last);
  const ext = path.extname(base);
  if (ext !== '' && KNOWN.has(ext.slice(1).toLowerCase())) return base.slice(0, 120);
  // No usable extension: take one from the content type. Without that the file is not one Convert can handle.
  const fromType = MIME_EXT[mime.toLowerCase().split(';')[0]?.trim() ?? ''];
  if (!fromType) return '';
  return `${path.basename(base, ext).slice(0, 100) || 'image'}.${fromType}`;
}

/**
 * Saves what was dragged out of a browser as ordinary files, so the same wheels, tools and actions can work
 * on them. Anything that is not a picture, video, audio file or PDF is skipped.
 */
export async function saveWebItems(
  items: readonly WebItem[],
  deps: WebDropDeps,
): Promise<{ paths: string[]; skipped: number }> {
  const exists = deps.exists ?? existsSync;
  const paths: string[] = [];
  let skipped = 0;
  await mkdir(deps.dir, { recursive: true });
  for (const item of items) {
    try {
      let bytes: Uint8Array | undefined = item.data;
      let mime = (item.mime ?? '').toLowerCase();
      let source = item.url;
      if (!bytes && item.url) {
        const inline = item.url.startsWith('data:') ? decodeDataUrl(item.url) : null;
        if (inline) {
          bytes = inline.bytes;
          mime = inline.mime;
        } else if (isFetchable(item.url)) {
          const res = await deps.fetch(item.url);
          if (!res.ok || !isFetchable(res.url)) throw new Error('not available');
          bytes = res.bytes;
          mime = res.contentType.toLowerCase().split(';')[0]?.trim() ?? '';
          source = res.url;
        }
      }
      if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_WEB_BYTES)
        throw new Error('no usable data');
      const name = nameFor(item, source, mime);
      if (name === '') throw new Error(`not a file Convert can use (${mime || 'unknown type'})`);
      const dest = uniqueSibling(path.join(deps.dir, name), exists, path);
      await writeFile(dest, bytes, { flag: 'wx' });
      paths.push(dest);
    } catch (error) {
      skipped++;
      log.error('could not save a dragged item', error instanceof Error ? error.message : error);
    }
  }
  return { paths, skipped };
}
