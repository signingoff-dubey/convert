import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ffmpegPath } from '../src/main/engines/binaries';
import { shutdownExiftool } from '../src/main/engines/meta';
import { JobQueue } from '../src/main/jobs/queue';
import type { JobResult, Operation, Params } from '../src/main/jobs/types';
import { defaultSettings, type Settings } from '../src/main/settings/schema';

let dir: string;
let settings: Settings;
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

async function run(
  id: string,
  kind: 'convert' | 'tool',
  paths: string[],
  params: Params = {},
  officePath: string | null = null,
): Promise<JobResult[]> {
  settings = defaultSettings();
  const q = new JobQueue({
    getSettings: () => settings,
    getOfficePath: () => officePath,
    trash: async () => undefined,
  });
  const op: Operation = { id, kind, params };
  const before = new Map(paths.map((p) => [p, sha(p)]));
  const { jobIds } = q.enqueue(op, paths);
  await q.idle();
  for (const [p, h] of before) expect(sha(p), `source changed: ${p}`).toBe(h);
  return jobIds.map((j) => q.resultOf(j) as JobResult);
}
const first = async (...args: Parameters<typeof run>) => (await run(...args))[0] as JobResult;
const ok = (r: JobResult): string => {
  expect(r.error, JSON.stringify(r.error)).toBeUndefined();
  expect(r.status).toBe('ok');
  return r.output as string;
};

async function photo(name: string, w = 120, h = 80): Promise<string> {
  const p = join(dir, name);
  // Left half red, right half blue, so crops and flips are checkable by pixel.
  const left = await sharp({
    create: { width: w / 2, height: h, channels: 3, background: '#ff0000' },
  })
    .png()
    .toBuffer();
  await sharp({ create: { width: w, height: h, channels: 3, background: '#0000ff' } })
    .composite([{ input: left, left: 0, top: 0 }])
    .png()
    .toFile(p);
  return p;
}
const pixel = async (p: string, x: number, y: number) => {
  const { data, info } = await sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 3;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'convert-editors-'));
});
afterAll(async () => {
  await shutdownExiftool();
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {
    // Windows keeps image files locked until the process ends; the OS temp folder is cleaned later.
  }
});

describe('crop', () => {
  it('extracts the requested area', async () => {
    const out = ok(
      await first('crop', 'tool', [await photo('c1.png')], {
        left: 70,
        top: 10,
        width: 40,
        height: 30,
      }),
    );
    const m = await sharp(out).metadata();
    expect([m.width, m.height]).toEqual([40, 30]);
    expect(await pixel(out, 5, 5)).toEqual([0, 0, 255]);
    expect(out.endsWith('c1-cropped.png')).toBe(true);
  });
  it('resizes to exact output dimensions', async () => {
    const out = ok(
      await first('crop', 'tool', [await photo('c2.png')], {
        left: 0,
        top: 0,
        width: 60,
        height: 40,
        outWidth: 300,
        outHeight: 200,
      }),
    );
    const m = await sharp(out).metadata();
    expect([m.width, m.height]).toEqual([300, 200]);
  });
  it('rejects an empty area', async () => {
    expect(
      (
        await first('crop', 'tool', [await photo('c3.png')], {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
        })
      ).error?.code,
    ).toBe('E_UNSUPPORTED');
  });
});

describe('edit', () => {
  it('rotates and flips', async () => {
    const src = await photo('e1.png');
    const rot = ok(await first('edit', 'tool', [src], { rotate: 90 }));
    const m = await sharp(rot).metadata();
    expect([m.width, m.height]).toEqual([80, 120]);
    const flipped = ok(await first('edit', 'tool', [src], { flipH: true }));
    expect(await pixel(flipped, 5, 5)).toEqual([0, 0, 255]);
  });
  it('brightens with exposure and desaturates with grayscale', async () => {
    const src = await photo('e2.png');
    const dark = ok(await first('edit', 'tool', [src], { exposure: -80 }));
    const bright = ok(await first('edit', 'tool', [src], { exposure: 80 }));
    const lum = async (p: string) =>
      (await sharp(p).stats()).channels.reduce((a, c) => a + c.mean, 0);
    expect(await lum(bright)).toBeGreaterThan(await lum(dark));
    const gray = ok(await first('edit', 'tool', [src], { grayscale: true }));
    const [r, g, b] = await pixel(gray, 5, 5);
    expect(Math.abs(r! - g!) + Math.abs(g! - b!)).toBeLessThan(6);
  });
  it('keeps transparency when adjusting contrast', async () => {
    const src = join(dir, 'e3.png');
    await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 4,
        background: { r: 200, g: 100, b: 50, alpha: 0.5 },
      },
    })
      .png()
      .toFile(src);
    const out = ok(await first('edit', 'tool', [src], { contrast: 40, saturation: 20 }));
    const { data } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBeGreaterThan(110);
    expect(data[3]).toBeLessThan(145);
  });
  it('refuses a no-op edit and ignores junk values', async () => {
    const src = await photo('e4.png');
    expect((await first('edit', 'tool', [src], {})).error?.code).toBe('E_UNSUPPORTED');
    expect((await first('edit', 'tool', [src], { exposure: 'abc', rotate: 'x' })).error?.code).toBe(
      'E_UNSUPPORTED',
    );
  });
});

describe('compress modes', () => {
  async function noisy(name: string): Promise<string> {
    const p = join(dir, name);
    const raw = Buffer.alloc(400 * 400 * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
    await sharp(raw, { raw: { width: 400, height: 400, channels: 3 } })
      .jpeg({ quality: 98 })
      .toFile(p);
    return p;
  }
  it('preset small produces a smaller file than the original', async () => {
    const src = await noisy('n1.jpg');
    const out = ok(await first('compress', 'tool', [src], { mode: 'preset', preset: 'small' }));
    expect(readFileSync(out).length).toBeLessThan(readFileSync(src).length);
  });
  it('size mode lands under the target size', async () => {
    const src = await noisy('n2.jpg');
    const target = Math.round(readFileSync(src).length / 1024 / 3);
    const out = ok(await first('compress', 'tool', [src], { mode: 'size', sizeKb: target }));
    expect(readFileSync(out).length).toBeLessThanOrEqual(target * 1024);
  });
  it('can resize while compressing', async () => {
    const src = await noisy('n3.jpg');
    const out = ok(
      await first('compress', 'tool', [src], { mode: 'preset', preset: 'balanced', resize: '50%' }),
    );
    expect((await sharp(out).metadata()).width).toBe(200);
  });
});

describe('add background', () => {
  it('places the photo on a gradient with the chosen ratio and padding', async () => {
    const out = ok(
      await first('add-bg', 'tool', [await photo('b1.png', 200, 100)], {
        bg: 'gradient',
        color1: '#ff0000',
        color2: '#00ff00',
        ratio: '1:1',
        padding: 10,
        radius: 20,
      }),
    );
    const m = await sharp(out).metadata();
    expect(m.width).toBe(m.height);
    expect(out.endsWith('b1-bg.png')).toBe(true);
    const [r1, g1] = await pixel(out, 2, 2);
    const [r2, g2] = await pixel(out, m.width! - 3, m.height! - 3);
    expect(r1! > g1! || g2! > r2!).toBe(true);
  });
  it('supports a solid colour and another image as background', async () => {
    const src = await photo('b2.png', 100, 100);
    const solid = ok(
      await first('add-bg', 'tool', [src], { bg: 'solid', color1: '#00ff00', padding: 20 }),
    );
    expect(await pixel(solid, 2, 2)).toEqual([0, 255, 0]);
    const other = await photo('b3.png', 50, 50);
    expect(
      existsSync(
        ok(await first('add-bg', 'tool', [src], { bg: 'image', bgImage: other, padding: 10 })),
      ),
    ).toBe(true);
  });
  it('rounds the photo corners', async () => {
    const out = ok(
      await first('add-bg', 'tool', [await photo('b4.png', 100, 100)], {
        bg: 'solid',
        color1: '#ffffff',
        padding: 20,
        radius: 50,
      }),
    );
    const m = await sharp(out).metadata();
    const corner = await pixel(out, Math.round(m.width! * 0.17), Math.round(m.height! * 0.17));
    expect(corner).toEqual([255, 255, 255]);
  });
});

describe('collage', () => {
  it.each(['grid', 'row', 'column', 'featured'])(
    'builds a %s collage from several images',
    async (layout) => {
      const a = await photo(`k-${layout}-1.png`, 100, 60);
      const b = await photo(`k-${layout}-2.png`, 60, 100);
      const c = await photo(`k-${layout}-3.png`, 80, 80);
      const out = ok(
        await first('collage', 'tool', [a, b, c], {
          layout,
          spacing: 10,
          radius: 8,
          color1: '#ffffff',
          width: 900,
        }),
      );
      expect(out.endsWith('-collage.png')).toBe(true);
      const m = await sharp(out).metadata();
      expect(m.width).toBe(900);
      expect(m.height).toBeGreaterThan(100);
    },
  );
  it('is a single job for the whole selection', async () => {
    const rs = await run('collage', 'tool', [await photo('k1.png'), await photo('k2.png')], {
      layout: 'row',
    });
    expect(rs).toHaveLength(1);
  });
});

describe('redact', () => {
  it('covers boxes with a solid colour and leaves the rest alone', async () => {
    const out = ok(
      await first('redact', 'tool', [await photo('r1.png')], {
        mode: 'solid',
        color: '#00ff00',
        boxes: JSON.stringify([{ x: 10, y: 10, w: 20, h: 20 }]),
      }),
    );
    expect(await pixel(out, 15, 15)).toEqual([0, 255, 0]);
    expect(await pixel(out, 50, 50)).toEqual([255, 0, 0]);
    expect(out.endsWith('r1-redacted.png')).toBe(true);
  });
  it('blurs a region so the original detail is gone', async () => {
    const src = join(dir, 'r2.png');
    const stripes = Buffer.alloc(100 * 100 * 3);
    for (let y = 0; y < 100; y++)
      for (let x = 0; x < 100; x++)
        stripes.fill(x % 2 ? 255 : 0, (y * 100 + x) * 3, (y * 100 + x) * 3 + 3);
    await sharp(stripes, { raw: { width: 100, height: 100, channels: 3 } })
      .png()
      .toFile(src);
    const out = ok(
      await first('redact', 'tool', [src], {
        mode: 'blur',
        boxes: JSON.stringify([{ x: 20, y: 20, w: 60, h: 60 }]),
      }),
    );
    const crop = async (l: number, t: number, n: number) =>
      (
        await sharp(
          await sharp(out).extract({ left: l, top: t, width: n, height: n }).png().toBuffer(),
        ).stats()
      ).channels[0]!;
    const inside = await crop(30, 30, 40);
    expect(inside.stdev).toBeLessThan(20);
    const outside = await crop(0, 0, 10);
    expect(outside.stdev).toBeGreaterThan(100);
  });
  it('refuses when no areas were chosen', async () => {
    expect(
      (await first('redact', 'tool', [await photo('r3.png')], { boxes: '[]' })).error?.code,
    ).toBe('E_UNSUPPORTED');
  });
});

describe('annotate save', () => {
  it('re-encodes the editor canvas, only from the app temp folder', async () => {
    const tmp = join(tmpdir(), 'convert-annot-0a1b2c3d.png');
    await sharp({ create: { width: 30, height: 20, channels: 4, background: '#123456' } })
      .png()
      .toFile(tmp);
    const src = await photo('a1.jpg'.replace('.jpg', '.png'));
    const out = ok(await first('annotate-save', 'tool', [src], { tmp }));
    expect((await sharp(out).metadata()).width).toBe(30);
    expect(existsSync(tmp)).toBe(false);
    expect(out.endsWith('a1-annotated.png')).toBe(true);
  });
  it('rejects a path outside the temp folder or with the wrong name', async () => {
    const evil = join(dir, 'convert-annot-0a1b2c3d.png');
    writeFileSync(evil, 'x');
    expect(
      (await first('annotate-save', 'tool', [await photo('a2.png')], { tmp: evil })).error?.code,
    ).toBe('E_UNSUPPORTED');
    expect(
      (await first('annotate-save', 'tool', [await photo('a3.png')], { tmp: '/etc/passwd' })).error
        ?.code,
    ).toBe('E_UNSUPPORTED');
  });
});

describe('metadata', () => {
  it('writes selected tags to a copy and leaves the source alone', async () => {
    const src = join(dir, 'm1.jpg');
    await sharp({ create: { width: 16, height: 16, channels: 3, background: '#345' } })
      .jpeg()
      .toFile(src);
    const res = await first('metadata', 'tool', [src], {
      f_Artist: 'Ada',
      f_Make: 'Acme',
      f_GPSLatitude: -33.5,
      f_GPSLongitude: 151.25,
      f_Bogus: 'x',
    });
    if (res.status === 'error') {
      expect(res.error?.code).toBe('E_ENGINE_MISSING'); // exiftool needs perl
      return;
    }
    const meta = await (await import('../src/main/engines/meta')).readMetadata(ok(res));
    expect(meta.Artist).toBe('Ada');
    expect(meta.Make).toBe('Acme');
    expect(meta.GPSLatitude).toBeCloseTo(-33.5, 3);
    expect(meta.GPSLongitude).toBeCloseTo(151.25, 3);
  });
  it('refuses an empty change set', async () => {
    const src = join(dir, 'm2.jpg');
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#345' } })
      .jpeg()
      .toFile(src);
    const res = await first('metadata', 'tool', [src], {});
    expect(['E_UNSUPPORTED', 'E_ENGINE_MISSING']).toContain(res.error?.code);
  });
});

describe('images to one PDF', () => {
  it('makes one page per image, mixing formats, in drop order', async () => {
    const a = await photo('p1.png', 100, 50);
    const b = join(dir, 'p2.jpg');
    await sharp({ create: { width: 60, height: 90, channels: 3, background: '#fa0' } })
      .jpeg()
      .toFile(b);
    const c = join(dir, 'p3.webp');
    await sharp({ create: { width: 40, height: 40, channels: 3, background: '#0af' } })
      .webp()
      .toFile(c);
    const rs = await run('pdf', 'convert', [a, b, c]);
    expect(rs).toHaveLength(1);
    const doc = await PDFDocument.load(readFileSync(ok(rs[0] as JobResult)));
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(0).getSize()).toEqual({ width: 75, height: 37.5 });
    expect(doc.getPage(1).getSize()).toEqual({ width: 45, height: 67.5 });
  });
  it('still makes one PDF per image for non-image drops', async () => {
    expect(await run('pdf', 'convert', [await photo('p4.png')])).toHaveLength(1);
  });
});

describe('svg and heic', () => {
  it('renders an SVG to PNG', async () => {
    const svg = join(dir, 'logo.svg');
    writeFileSync(
      svg,
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#f00"/></svg>',
    );
    const out = ok(await first('png', 'convert', [svg]));
    expect((await sharp(out).metadata()).width).toBeGreaterThan(30);
  });
  it.skipIf(process.platform === 'win32')(
    'reports a missing HEIC encoder cleanly (no Windows imaging here)',
    async () => {
      const res = await first('heic', 'convert', [await photo('h1.png')]);
      expect(res.error?.code).toBe('E_ENGINE_MISSING');
    },
  );
});

describe('mov, avi, wmv and gif input', () => {
  const ff = () => ffmpegPath() as string;
  it('converts a GIF to mp4 with even dimensions', async () => {
    const gif = join(dir, 'anim.gif');
    execFileSync(ff(), [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=1:size=101x75:rate=10',
      gif,
    ]);
    const out = ok(await first('mp4', 'convert', [gif]));
    expect(out.endsWith('.mp4')).toBe(true);
  }, 30_000);
  it.each(['mov', 'avi', 'wmv'])(
    'writes %s',
    async (ext) => {
      const src = join(dir, `src-${ext}.mp4`);
      execFileSync(ff(), [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=1:size=64x48:rate=10',
        '-f',
        'lavfi',
        '-i',
        'sine=duration=1',
        '-shortest',
        '-pix_fmt',
        'yuv420p',
        src,
      ]);
      expect(readFileSync(ok(await first(ext, 'convert', [src]))).length).toBeGreaterThan(500);
    },
    30_000,
  );
});

describe('epub, rtf and office-only formats', () => {
  it('converts markdown to epub and epub back to markdown and txt', async () => {
    const md = join(dir, 'book.md');
    writeFileSync(md, '# One\n\nfirst chapter text\n\n# Two\n\nsecond chapter text\n');
    const epub = ok(await first('epub', 'convert', [md]));
    const zip = await JSZip.loadAsync(readFileSync(epub));
    expect(Object.keys(zip.files)).toContain('OEBPS/chapter2.xhtml');
    const back = readFileSync(ok(await first('md', 'convert', [epub])), 'utf8');
    expect(back).toContain('first chapter text');
    expect(back.indexOf('first')).toBeLessThan(back.indexOf('second'));
    expect(readFileSync(ok(await first('txt', 'convert', [epub])), 'utf8')).toContain(
      'second chapter text',
    );
  });
  it('reads RTF without LibreOffice', async () => {
    const rtf = join(dir, 'note.rtf');
    writeFileSync(
      rtf,
      [
        '{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\pard Hello \\b world\\b0  caf',
        "\\'e9 \\u8364?\\par Second line\\par}",
      ].join(''),
      'latin1',
    );
    const txt = readFileSync(ok(await first('txt', 'convert', [rtf])), 'utf8');
    expect(txt).toContain('Hello world');
    expect(txt).toContain('café');
    expect(txt).toContain('€');
    expect(txt).toContain('Second line');
    expect(txt).not.toContain('Arial');
    expect(readFileSync(ok(await first('md', 'convert', [rtf])), 'utf8')).toContain('Second line');
  });
  it('converts PDF to epub and to a spreadsheet of text positions', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 300]);
    page.drawText('Name', { x: 20, y: 250, size: 12, font });
    page.drawText('Qty', { x: 200, y: 250, size: 12, font });
    page.drawText('Apple', { x: 20, y: 230, size: 12, font });
    page.drawText('3', { x: 200, y: 230, size: 12, font });
    const pdf = join(dir, 'table.pdf');
    writeFileSync(pdf, await doc.save());
    const epub = ok(await first('epub', 'convert', [pdf]));
    expect(readFileSync(epub).length).toBeGreaterThan(500);
    const xlsx = ok(await first('xlsx', 'convert', [pdf]));
    const csv = readFileSync(ok(await first('csv', 'convert', [xlsx])), 'utf8');
    expect(csv).toContain('Name,Qty');
    expect(csv).toContain('Apple,3');
  }, 60_000);
  it('says LibreOffice is needed for slides, ods, xls, docx-from-pdf, and rtf to pdf', async () => {
    const files: [string, string][] = [
      ['deck.pptx', 'pdf'],
      ['sheet.ods', 'xlsx'],
      ['old.xls', 'csv'],
      ['doc.pdf', 'docx'],
      ['t.xlsx', 'ods'],
    ];
    for (const [name, target] of files) {
      const p = join(dir, name);
      if (name === 'doc.pdf') copyFileSync(join(dir, 'table.pdf'), p);
      else if (name === 't.xlsx')
        copyFileSync(
          (await run('xlsx', 'convert', [join(dir, 'table.pdf')]))[0]!.output as string,
          p,
        );
      else writeFileSync(p, 'x');
      expect((await first(target, 'convert', [p])).error?.code, `${name} to ${target}`).toBe(
        'E_ENGINE_MISSING',
      );
    }
  }, 60_000);
});
