import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dragTypes, webAddresses, type DragData } from '../src/renderer/overlay/web-drag';
import { gate } from './helpers-gate';
import {
  isFetchable,
  isPrivateHost,
  nameFor,
  saveWebItems,
  type WebFetchResult,
} from '../src/main/services/webdrop';

const dir = mkdtempSync(join(tmpdir(), 'convert-web-'));
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold a file.
  }
});

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const reply = (over: Partial<WebFetchResult> = {}): WebFetchResult => ({
  ok: true,
  url: 'https://example.com/cats/tabby.jpg',
  contentType: 'image/jpeg',
  bytes: png,
  ...over,
});

describe('pictures dragged out of a browser', () => {
  it('refuses addresses on this computer or its network, and anything that is not http(s) or an inline picture', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      '10.1.2.3',
      '192.168.0.9',
      '172.20.1.1',
      '169.254.169.254',
      'router',
      'nas.local',
      '[::1]',
      'fd00::1',
    ])
      expect(isPrivateHost(host), host).toBe(true);
    for (const host of ['example.com', '8.8.8.8', '172.32.0.1', 'images.google.com'])
      expect(isPrivateHost(host), host).toBe(false);
    expect(isFetchable('https://example.com/a.png')).toBe(true);
    expect(isFetchable('http://192.168.1.1/a.png')).toBe(false);
    expect(isFetchable('file:///C:/secret.png')).toBe(false);
    expect(isFetchable('javascript:alert(1)')).toBe(false);
    expect(isFetchable('data:image/png;base64,AAAA')).toBe(true);
    expect(isFetchable('data:text/html,<script>')).toBe(false);
  });

  it('names the file from the browser, the address or the content type', () => {
    expect(nameFor({ name: 'cat.jpg' }, undefined, 'image/jpeg')).toBe('cat.jpg');
    expect(nameFor({}, 'https://x.com/a/b/dog%20pic.webp?size=big', 'image/webp')).toBe(
      'dog pic.webp',
    );
    expect(nameFor({}, 'https://x.com/photo?id=1', 'image/png')).toBe('photo.png');
    expect(nameFor({}, 'data:image/png;base64,AAAA', 'image/png')).toBe('image.png');
    expect(nameFor({ name: '../../evil.png' }, undefined, 'image/png')).toBe('evil.png');
    expect(nameFor({ name: 'page.html' }, undefined, 'text/html')).toBe('');
    expect(nameFor({}, 'https://x.com/file.exe', 'application/x-msdownload')).toBe('');
  });

  it('saves the bytes the browser gave, never overwriting a file already in Downloads', async () => {
    const deps = { dir, fetch: async () => reply() };
    const first = await saveWebItems([{ name: 'cat.png', mime: 'image/png', data: png }], deps);
    const second = await saveWebItems([{ name: 'cat.png', mime: 'image/png', data: png }], deps);
    expect(first.paths).toEqual([join(dir, 'cat.png')]);
    expect(second.paths).toEqual([join(dir, 'cat (1).png')]);
    expect([...readFileSync(first.paths[0] as string)]).toEqual([...png]);
  });

  it('fetches an address, decodes an inline picture, and skips everything unusable', async () => {
    const calls: string[] = [];
    const deps = {
      dir,
      fetch: async (url: string) => {
        calls.push(url);
        if (url.includes('redirect')) return reply({ url: 'http://127.0.0.1/inner.jpg' });
        if (url.includes('page')) return reply({ contentType: 'text/html', url });
        if (url.includes('missing')) return reply({ ok: false, url });
        return reply({ url });
      },
    };
    const r = await saveWebItems(
      [
        { url: 'https://cdn.example.com/tabby.jpg' },
        { url: 'data:image/png;base64,iVBORw0K' },
        { url: 'https://example.com/redirect.jpg' }, // ends up on a private address
        { url: 'https://example.com/page' }, // an HTML page, not a picture
        { url: 'https://example.com/missing.png' },
        { url: 'http://localhost:8080/x.png' }, // never fetched
        { url: 'file:///C:/x.png' },
        { name: 'empty.png', mime: 'image/png', data: new Uint8Array() },
      ],
      deps,
    );
    expect(r.paths.map((p) => p.slice(dir.length + 1))).toEqual(['tabby.jpg', 'image.png']);
    expect(r.skipped).toBe(6);
    expect(calls).not.toContain('http://localhost:8080/x.png');
    expect(existsSync(join(dir, 'tabby.jpg'))).toBe(true);
  });

  it('reads what the overlay needs from a drag', () => {
    const drag = (
      items: { kind: string; type: string }[],
      data: Record<string, string> = {},
    ): DragData => ({
      items,
      getData: (t) => data[t] ?? '',
    });
    expect(dragTypes(drag([{ kind: 'file', type: 'image/webp' }]))).toEqual(['image/webp']);
    // A picture dragged from a page only has text data until it is dropped: show the picture wheel.
    expect(
      dragTypes(
        drag([
          { kind: 'string', type: 'text/uri-list' },
          { kind: 'string', type: 'text/html' },
        ]),
      ),
    ).toEqual(['image/png']);
    expect(dragTypes(drag([{ kind: 'string', type: 'text/plain' }]))).toEqual([]);
    expect(
      webAddresses(
        drag([], { 'text/uri-list': '# comment\r\nhttps://a.com/1.png\r\nhttps://a.com/2.png' }),
      ),
    ).toEqual(['https://a.com/1.png', 'https://a.com/2.png']);
    expect(
      webAddresses(
        drag([], {
          'text/html': '<a href="x"><img alt="" src="https://a.com/p.jpg?x=1&amp;y=2"></a>',
        }),
      ),
    ).toEqual(['https://a.com/p.jpg?x=1&y=2']);
    expect(webAddresses(drag([]))).toEqual([]);
  });

  it('lets a drag that starts in a browser open the wheel only when that is switched on', () => {
    const g = { limitToExplorerAndDesktop: true, allowedWindowClasses: ['CabinetWClass'] };
    expect(gate('Chrome_WidgetWin_1', g)).toBe(false);
    expect(gate('Chrome_WidgetWin_1', { ...g, dragFromBrowsers: true })).toBe(true);
    expect(gate('MozillaWindowClass', { ...g, dragFromBrowsers: true })).toBe(true);
    expect(gate('Notepad', { ...g, dragFromBrowsers: true })).toBe(false);
  });
});
