import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ffmpegPath, sevenZipPath } from '../src/main/engines/binaries';
import { JobQueue } from '../src/main/jobs/queue';
import type { JobResult, Operation, Params } from '../src/main/jobs/types';
import { defaultSettings, type Settings } from '../src/main/settings/schema';
import { probeDuration } from '../src/main/engines/av';
import { shutdownExiftool } from '../src/main/engines/meta';

let dir: string;
let settings: Settings;

const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const magic = (p: string, n = 12) => readFileSync(p).subarray(0, n);
const ffmpeg = () => ffmpegPath() as string;

function queue(extra: Partial<Settings['output']> = {}) {
  settings = defaultSettings();
  settings.output = { ...settings.output, ...extra };
  return new JobQueue({
    getSettings: () => settings,
    getOfficePath: () => null,
    trash: async () => undefined,
  });
}

async function run(
  id: string,
  kind: 'convert' | 'tool',
  paths: string[],
  params: Params = {},
  q = queue(),
): Promise<JobResult[]> {
  const op: Operation = { id, kind, params };
  const before = new Map(paths.map((p) => [p, sha(p)]));
  const { jobIds } = q.enqueue(op, paths);
  await q.idle();
  for (const [p, h] of before) expect(sha(p), `source changed: ${p}`).toBe(h); // sources are never touched
  return jobIds.map((j) => q.resultOf(j) as JobResult);
}

const ok = (r: JobResult): string => {
  expect(r.error, JSON.stringify(r.error)).toBeUndefined();
  expect(r.status).toBe('ok');
  return r.output as string;
};

async function makePng(name: string, w = 64, h = 32): Promise<string> {
  const p = join(dir, name);
  await sharp({
    create: { width: w, height: h, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } },
  })
    .png()
    .toFile(p);
  return p;
}

function makeAudio(name: string, secs = 1): string {
  const p = join(dir, name);
  execFileSync(ffmpeg(), [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${secs}`,
    p,
  ]);
  return p;
}

function makeVideo(name: string, secs = 1, size = '160x120', withAudio = true): string {
  const p = join(dir, name);
  const audio = withAudio
    ? ['-f', 'lavfi', '-i', `sine=frequency=330:duration=${secs}`, '-shortest']
    : [];
  execFileSync(ffmpeg(), [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc=duration=${secs}:size=${size}:rate=15`,
    ...audio,
    '-pix_fmt',
    'yuv420p',
    p,
  ]);
  return p;
}

async function makePdf(name: string, pages: string[]): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages)
    doc.addPage([300, 200]).drawText(text, { x: 20, y: 100, size: 18, font });
  const p = join(dir, name);
  writeFileSync(p, await doc.save());
  return p;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'convert-test-'));
});
afterAll(async () => {
  await shutdownExiftool();
  rmSync(dir, { recursive: true, force: true });
});

describe('images', () => {
  it.each([
    ['jpg', Buffer.from([0xff, 0xd8, 0xff])],
    ['webp', Buffer.from('WEBP')],
    ['tiff', null],
    ['bmp', Buffer.from('BM')],
    ['pdf', Buffer.from('%PDF')],
    ['avif', Buffer.from('ftypavif')],
  ] as const)('converts png to %s', async (target, sig) => {
    const src = await makePng(`img-${target}.png`);
    const out = ok((await run(target, 'convert', [src]))[0] as JobResult);
    expect(out.endsWith(`.${target}`)).toBe(true);
    expect(statSync(out).size).toBeGreaterThan(0);
    if (sig) expect(readFileSync(out).includes(sig)).toBe(true);
    if (target === 'tiff') expect(['II*\0', 'MM\0*']).toContain(magic(out, 4).toString('latin1'));
  });

  it('keeps pixel dimensions through conversion and encodes BMP correctly', async () => {
    const src = await makePng('dims.png', 50, 20);
    const bmp = ok((await run('bmp', 'convert', [src]))[0] as JobResult);
    const buf = readFileSync(bmp);
    expect(buf.readInt32LE(18)).toBe(50);
    expect(buf.readInt32LE(22)).toBe(20);
    const back = await sharp(bmp)
      .metadata()
      .catch(() => null);
    if (back) expect([back.width, back.height]).toEqual([50, 20]);
  });

  it('numbers collisions and never overwrites', async () => {
    const src = await makePng('twice.png');
    const first = ok((await run('jpg', 'convert', [src]))[0] as JobResult);
    const second = ok((await run('jpg', 'convert', [src]))[0] as JobResult);
    expect(first.endsWith('twice.jpg')).toBe(true);
    expect(second.endsWith('twice (1).jpg')).toBe(true);
  });

  it('resizes to 50% and rotates and flips', async () => {
    const src = await makePng('geo.png', 100, 40);
    const half = ok((await run('resize', 'tool', [src]))[0] as JobResult);
    expect((await sharp(half).metadata()).width).toBe(50);
    const rot = ok((await run('rotate', 'tool', [src]))[0] as JobResult);
    const m = await sharp(rot).metadata();
    expect([m.width, m.height]).toEqual([40, 100]);
    expect(existsSync(ok((await run('flip', 'tool', [src]))[0] as JobResult))).toBe(true);
  });

  it('compresses a noisy jpg and reports already compact when it cannot shrink', async () => {
    const noise = join(dir, 'noise.jpg');
    await sharp(randomBytes(300 * 300 * 3), { raw: { width: 300, height: 300, channels: 3 } })
      .jpeg({ quality: 100 })
      .toFile(noise);
    const out = ok((await run('compress', 'tool', [noise]))[0] as JobResult);
    expect(statSync(out).size).toBeLessThan(statSync(noise).size);
    const tiny = join(dir, 'tiny.jpg');
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } })
      .jpeg({ quality: 40 })
      .toFile(tiny);
    const res = (await run('compress', 'tool', [tiny]))[0] as JobResult;
    expect(res.status).toBe('ok');
    expect(res.note).toBe('already-compact');
    expect(res.output).toBeUndefined();
  });

  it('strips metadata on a copy', async () => {
    const src = join(dir, 'exif.jpg');
    await sharp({ create: { width: 16, height: 16, channels: 3, background: '#123' } })
      .withExif({ IFD0: { Copyright: 'secret' } })
      .jpeg()
      .toFile(src);
    const res = (await run('strip-metadata', 'tool', [src]))[0] as JobResult;
    if (res.status === 'error') {
      // exiftool needs perl; without it the engine must fail cleanly and leave the source alone.
      expect(res.error?.code).toBe('E_ENGINE_MISSING');
      return;
    }
    const out = ok(res);
    expect(readFileSync(out).includes('secret')).toBe(false);
    expect(readFileSync(src).includes('secret')).toBe(true);
  });

  it('reports corrupt input and leaves no temp files', async () => {
    const full = readFileSync(await makePng('whole.png', 200, 200));
    const bad = join(dir, 'truncated.png');
    writeFileSync(bad, full.subarray(0, 60));
    const res = (await run('jpg', 'convert', [bad]))[0] as JobResult;
    expect(res.status).toBe('error');
    expect(res.error?.code).toBe('E_CORRUPT_INPUT');
    expect(readdirSync(dir).filter((f) => f.startsWith('~convert'))).toEqual([]);
  });
});

describe('audio and video', () => {
  it('converts wav to mp3, flac and ogg', async () => {
    const src = makeAudio('tone.wav');
    for (const t of ['mp3', 'flac', 'ogg']) {
      const out = ok((await run(t, 'convert', [src]))[0] as JobResult);
      expect(statSync(out).size).toBeGreaterThan(100);
    }
  }, 30_000);

  it('converts video to mp4, gif and extracted mp3 with progress', async () => {
    const src = makeVideo('clip.mkv');
    const q = queue();
    const percents: number[] = [];
    q.on('update', (s: { percent: number }) => percents.push(s.percent));
    const out = ok((await run('mp4', 'convert', [src], {}, q))[0] as JobResult);
    expect(magic(out, 12).includes(Buffer.from('ftyp'))).toBe(true);
    expect(percents.at(-1)).toBe(100);
    expect(magic(ok((await run('gif', 'convert', [src]))[0] as JobResult), 3).toString()).toBe(
      'GIF',
    );
    expect(statSync(ok((await run('mp3', 'convert', [src]))[0] as JobResult)).size).toBeGreaterThan(
      100,
    );
  }, 60_000);

  it('trims audio to the requested range', async () => {
    const src = makeAudio('long.wav', 4);
    const out = ok((await run('trim', 'tool', [src], { start: 1, end: 2 }))[0] as JobResult);
    const seconds = await probeDuration(out);
    expect(seconds).toBeGreaterThan(0.8);
    expect(seconds).toBeLessThan(1.3);
  }, 30_000);

  it('explains that a silent video has no audio to extract', async () => {
    const silent = makeVideo('silent.mp4', 1, '160x120', false);
    const res = (await run('mp3', 'convert', [silent]))[0] as JobResult;
    expect(res.error?.code).toBe('E_UNSUPPORTED');
  }, 30_000);

  it('reports a zero-byte mp3 as corrupt', async () => {
    const empty = join(dir, 'empty.mp3');
    writeFileSync(empty, '');
    const res = (await run('wav', 'convert', [empty]))[0] as JobResult;
    expect(res.status).toBe('error');
    expect(res.error?.code).toBe('E_CORRUPT_INPUT');
  });

  it('cancel kills ffmpeg and leaves no temp output', async () => {
    const src = makeVideo('big.mp4', 20, '1280x720');
    const q = queue();
    const { jobIds } = q.enqueue({ id: 'compress', kind: 'tool' }, [src]);
    await new Promise((r) => setTimeout(r, 400));
    q.cancel(jobIds[0] as string);
    await q.idle();
    expect(q.resultOf(jobIds[0] as string)?.status).toBe('cancelled');
    expect(readdirSync(dir).filter((f) => f.startsWith('~convert'))).toEqual([]);
    expect(existsSync(join(dir, 'big (1).mp4'))).toBe(false);
  }, 60_000);
});

describe('pdf', () => {
  it('renders every page to numbered PNGs in a new folder', async () => {
    const src = await makePdf('doc.pdf', ['one', 'two', 'three']);
    const out = ok((await run('png', 'convert', [src]))[0] as JobResult);
    expect(statSync(out).isDirectory()).toBe(true);
    expect(readdirSync(out)).toEqual(['doc-001.png', 'doc-002.png', 'doc-003.png']);
    const m = await sharp(join(out, 'doc-001.png')).metadata();
    expect(m.width).toBe(Math.ceil((300 * 300) / 72));
  }, 60_000);

  it('extracts text to txt and md', async () => {
    const src = await makePdf('text.pdf', ['hello world', 'second page']);
    expect(
      readFileSync(ok((await run('txt', 'convert', [src]))[0] as JobResult), 'utf8'),
    ).toContain('hello world');
    const md = readFileSync(ok((await run('md', 'convert', [src]))[0] as JobResult), 'utf8');
    expect(md).toContain('## Page 2');
  }, 60_000);

  it('splits by range, merges and compresses', async () => {
    const src = await makePdf('five.pdf', ['a', 'b', 'c', 'd', 'e']);
    const out = ok((await run('split', 'tool', [src], { ranges: '1-2, 5' }))[0] as JobResult);
    expect(readdirSync(out).sort()).toEqual(['five-p1-2.pdf', 'five-p5.pdf']);
    expect((await PDFDocument.load(readFileSync(join(out, 'five-p1-2.pdf')))).getPageCount()).toBe(
      2,
    );
    const other = await makePdf('two.pdf', ['x', 'y']);
    const merged = ok((await run('merge', 'tool', [src, other]))[0] as JobResult);
    expect(merged.endsWith('five-merged.pdf')).toBe(true);
    expect((await PDFDocument.load(readFileSync(merged))).getPageCount()).toBe(7);
    const c = (await run('compress', 'tool', [src]))[0] as JobResult;
    expect(c.status).toBe('ok');
  }, 60_000);

  it('rejects bad page ranges and corrupt PDFs', async () => {
    const src = await makePdf('r.pdf', ['a']);
    expect(
      ((await run('split', 'tool', [src], { ranges: '9-12' }))[0] as JobResult).error?.code,
    ).toBe('E_UNSUPPORTED');
    const bad = join(dir, 'bad.pdf');
    writeFileSync(bad, '%PDF-1.4 nonsense');
    expect(((await run('compress', 'tool', [bad]))[0] as JobResult).error?.code).toBe(
      'E_CORRUPT_INPUT',
    );
  });
});

describe('documents, sheets, subtitles, archives', () => {
  it('converts markdown to html, txt and docx, and docx back to markdown', async () => {
    const md = join(dir, 'note.md');
    writeFileSync(md, '# Title\n\nSome **bold** text.\n\n- one\n- two\n\n```\ncode\n```\n');
    expect(
      readFileSync(ok((await run('html', 'convert', [md]))[0] as JobResult), 'utf8'),
    ).toContain('<h1>Title</h1>');
    expect(readFileSync(ok((await run('txt', 'convert', [md]))[0] as JobResult), 'utf8')).toContain(
      'Some bold text.',
    );
    const docx = ok((await run('docx', 'convert', [md]))[0] as JobResult);
    expect(magic(docx, 2).toString()).toBe('PK');
    const back = readFileSync(ok((await run('md', 'convert', [docx]))[0] as JobResult), 'utf8');
    expect(back).toContain('Title');
    expect(back).toContain('**bold**');
  });

  it('converts html to md and txt to html', async () => {
    const html = join(dir, 'p.html');
    writeFileSync(html, '<h2>Head</h2><p>Para <em>it</em></p>');
    expect(
      readFileSync(ok((await run('md', 'convert', [html]))[0] as JobResult), 'utf8'),
    ).toContain('## Head');
    const txt = join(dir, 'p.txt');
    writeFileSync(txt, 'a < b\n\nsecond');
    expect(
      readFileSync(ok((await run('html', 'convert', [txt]))[0] as JobResult), 'utf8'),
    ).toContain('a &lt; b');
  });

  it('hides the PDF wedge by failing cleanly without the Office engine', async () => {
    const md = join(dir, 'o.md');
    writeFileSync(md, '# x');
    expect(((await run('pdf', 'convert', [md]))[0] as JobResult).error?.code).toBe(
      'E_ENGINE_MISSING',
    );
  });

  it('round-trips csv, tsv and xlsx', async () => {
    const csv = join(dir, 'data.csv');
    writeFileSync(csv, 'name,qty\n"Smith, J",3\nÅsa,4\n');
    const xlsx = ok((await run('xlsx', 'convert', [csv]))[0] as JobResult);
    const tsv = ok((await run('tsv', 'convert', [xlsx]))[0] as JobResult);
    const text = readFileSync(tsv, 'utf8');
    expect(text).toContain('name\tqty');
    expect(text).toContain('Smith, J\t3');
    expect(text).toContain('Åsa\t4');
  });

  it('converts srt to vtt and back, and to text', async () => {
    const srt = join(dir, 'sub.srt');
    writeFileSync(
      srt,
      '1\n00:00:01,000 --> 00:00:02,500\nHello <i>there</i>\n\n2\n00:01:00,000 --> 00:01:01,000\nBye\n',
    );
    const vtt = ok((await run('vtt', 'convert', [srt]))[0] as JobResult);
    expect(readFileSync(vtt, 'utf8')).toBe(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello <i>there</i>\n\n00:01:00.000 --> 00:01:01.000\nBye\n',
    );
    const back = ok((await run('srt', 'convert', [vtt]))[0] as JobResult);
    expect(readFileSync(back, 'utf8')).toContain('1\n00:00:01,000 --> 00:00:02,500');
    expect(
      readFileSync(ok((await run('txt', 'convert', [srt]))[0] as JobResult), 'utf8'),
    ).toContain('Hello there');
  });

  it('packs, converts and extracts archives', async () => {
    const folder = join(dir, 'payload');
    execFileSync('mkdir', [folder]);
    writeFileSync(join(folder, 'a.txt'), 'alpha');
    writeFileSync(join(folder, 'b.txt'), 'beta');
    const zip = join(dir, 'payload.zip');
    execFileSync(sevenZipPath() as string, ['a', '-tzip', zip, '.'], { cwd: folder });
    const tar = ok((await run('tar', 'convert', [zip]))[0] as JobResult);
    expect(statSync(tar).size).toBeGreaterThan(0);
    const gz = ok((await run('gz', 'convert', [zip]))[0] as JobResult);
    const extracted = ok((await run('extract-here', 'convert', [gz]))[0] as JobResult);
    expect(statSync(extracted).isDirectory()).toBe(true);
    const files: string[] = [];
    const walk = (d: string): void =>
      readdirSync(d).forEach((f) =>
        statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(f),
      );
    walk(extracted);
    expect(files.sort()).toContain('a.txt');
  }, 30_000);
});

describe('queue behaviour', () => {
  it('turns a multi-file drop into one job per file and one batch', async () => {
    const a = await makePng('m1.png');
    const b = await makePng('m2.png');
    const q = queue();
    const { batchId, jobIds } = q.enqueue({ id: 'jpg', kind: 'convert' }, [a, b]);
    expect(jobIds).toHaveLength(2);
    await q.idle();
    for (const id of jobIds) expect(q.resultOf(id)?.batchId).toBe(batchId);
  });

  it('undo deletes only the output, and only inside the window', async () => {
    const src = await makePng('undo.png');
    const q = queue();
    const { jobIds } = q.enqueue({ id: 'jpg', kind: 'convert' }, [src]);
    await q.idle();
    const out = q.outputOf(jobIds[0] as string) as string;
    expect(existsSync(out)).toBe(true);
    expect(await q.undo(jobIds[0] as string)).toBe(true);
    expect(existsSync(out)).toBe(false);
    expect(existsSync(src)).toBe(true);
  });

  it('uses the Converted subfolder and sends the original to the bin only when enabled', async () => {
    const src = await makePng('bin.png');
    const trashed: string[] = [];
    settings = defaultSettings();
    settings.output = { ...settings.output, useConvertedSubfolder: true, recycleOriginal: true };
    const q = new JobQueue({
      getSettings: () => settings,
      getOfficePath: () => null,
      trash: async (p) => void trashed.push(p),
    });
    const { jobIds } = q.enqueue({ id: 'jpg', kind: 'convert' }, [src]);
    await q.idle();
    expect(q.outputOf(jobIds[0] as string)).toBe(join(dir, 'Converted', 'bin.jpg'));
    expect(trashed).toEqual([src]);
  });

  it('fails with E_UNSUPPORTED for a combination no engine handles', async () => {
    const src = await makePng('nope.png');
    expect(((await run('mp3', 'convert', [src]))[0] as JobResult).error?.code).toBe(
      'E_UNSUPPORTED',
    );
  });
});
