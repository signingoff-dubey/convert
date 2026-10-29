import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { net, protocol } from 'electron';
import { extensionOf } from '../shared/formats';
import { open } from './engines/image';

export const PREVIEW_SCHEME = 'convert-file';

/** Types a browser engine cannot draw directly; they are converted to PNG on the fly. */
const NEEDS_CONVERSION = new Set(['heic', 'tiff', 'bmp']);
const MAX_PREVIEW = 2400;

export function needsPreviewConversion(filePath: string): boolean {
  return NEEDS_CONVERSION.has(extensionOf(filePath));
}

/** Must run before app.whenReady(). */
export function registerPreviewScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PREVIEW_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ]);
}

const allowed = new Set<string>();

/** Only files a tool window was opened with can be previewed. */
export function allowPreview(paths: readonly string[]): void {
  for (const p of paths) allowed.add(path.resolve(p));
}

export function clearPreview(): void {
  allowed.clear();
}

export function previewUrl(filePath: string): string {
  return `${PREVIEW_SCHEME}://local/${encodeURIComponent(filePath)}`;
}

/** Without CORS headers the canvas would be tainted and the editors could not read or export pixels. */
function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set('access-control-allow-origin', '*');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export function installPreviewHandler(): void {
  protocol.handle(PREVIEW_SCHEME, async (request) => {
    const url = new URL(request.url);
    const target = path.resolve(decodeURIComponent(url.pathname.slice(1)));
    if (!allowed.has(target)) return new Response('not allowed', { status: 403 });
    if (needsPreviewConversion(target)) {
      const png = await (
        await open(target)
      )
        .rotate()
        .resize(MAX_PREVIEW, MAX_PREVIEW, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      return new Response(new Uint8Array(png), {
        headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' },
      });
    }
    // Other formats stream straight from disk, which also gives audio and video seeking.
    const res = await net.fetch(pathToFileURL(target).toString(), { headers: request.headers });
    return withCors(res);
  });
}
