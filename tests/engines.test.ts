import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
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
import { basename, dirname, join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ffmpegPath, sevenZipPath } from '../src/main/engines/binaries';
import { JobQueue } from '../src/main/jobs/queue';
import type { JobResult, Operation, Params } from '../src/main/jobs/types';
import { defaultSettings, type Settings } from '../src/main/settings/schema';
import { probeDuration } from '../src/main/engines/av';
import { shutdownExiftool } from '../src/main/engines/meta';
import { bandCuts, shutdownOcr } from '../src/main/engines/ocr';
import { setHtmlToPdf } from '../src/main/engines/html-pdf';
import { createCanvas } from '@napi-rs/canvas';

let dir: string;
let settings: Settings;

const sha = (p: string): string => {
  const h = createHash('sha256');
  if (statSync(p).isDirectory()) {
    for (const n of readdirSync(p).sort()) h.update(n).update(sha(join(p, n)));
  } else h.update(readFileSync(p));
  return h.digest('hex');
};
const magic = (p: string, n = 12) => readFileSync(p).subarray(0, n);
const ffmpeg = () => ffmpegPath() as string;

function queue(extra: Partial<Settings['output']> = {}) {
  settings = defaultSettings();
  settings.output = { ...settings.output, ...extra };
  return new JobQueue({
    getSettings: () => settings,
    getOfficePath: () => null,
    trash: async () => undefined,
    copyText: (text) => void clipboard.push(text),
  });
}
const clipboard: string[] = [];

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
  await shutdownOcr();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows keeps image files locked until the process ends; the OS temp folder is cleaned later.
  }
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
  it('renders every page to numbered PNGs directly beside the PDF, in no new folder', async () => {
    const src = await makePdf('doc.pdf', ['one', 'two', 'three']);
    const r = (await run('png', 'convert', [src]))[0] as JobResult;
    const first = ok(r);
    expect(r.outputs?.map((o) => basename(o))).toEqual([
      'doc-001.png',
      'doc-002.png',
      'doc-003.png',
    ]);
    for (const o of r.outputs ?? []) expect(dirname(o)).toBe(dirname(src));
    expect(
      readdirSync(dir).some((f) => statSync(join(dir, f)).isDirectory() && f.startsWith('doc')),
    ).toBe(false);
    const m = await sharp(first).metadata();
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
    const split = (await run('split', 'tool', [src], { ranges: '1-2, 5' }))[0] as JobResult;
    ok(split);
    expect(split.outputs?.map((o) => basename(o)).sort()).toEqual(['five-p1-2.pdf', 'five-p5.pdf']);
    for (const o of split.outputs ?? []) expect(dirname(o)).toBe(dirname(src));
    const twoPage = (split.outputs ?? []).find((o) => o.endsWith('five-p1-2.pdf')) as string;
    expect((await PDFDocument.load(readFileSync(twoPage))).getPageCount()).toBe(2);
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
    const extracted = (await run('extract-here', 'convert', [gz]))[0] as JobResult;
    ok(extracted);
    // Two items inside: they go into a folder named after the archive, beside the archive.
    expect(extracted.outputs).toHaveLength(1);
    const unpacked = extracted.outputs?.[0] as string;
    expect(statSync(unpacked).isDirectory()).toBe(true);
    expect(basename(unpacked)).toMatch(/^payload( \(\d+\))?$/);
    expect(dirname(unpacked)).toBe(dirname(gz));
    expect(readdirSync(unpacked).sort()).toEqual(['a.txt', 'b.txt']);
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

describe('results sit beside the original', () => {
  it('never overwrites: a second run numbers every page file', async () => {
    const src = await makePdf('twice.pdf', ['a', 'b']);
    const first = (await run('png', 'convert', [src]))[0] as JobResult;
    const second = (await run('png', 'convert', [src]))[0] as JobResult;
    expect(first.outputs?.map((o) => basename(o))).toEqual(['twice-001.png', 'twice-002.png']);
    expect(second.outputs?.map((o) => basename(o))).toEqual([
      'twice-001 (1).png',
      'twice-002 (1).png',
    ]);
  }, 60_000);

  it('undo removes every file the job created and nothing else', async () => {
    const src = await makePdf('undone.pdf', ['a', 'b', 'c']);
    const q = queue();
    const { jobIds } = q.enqueue({ id: 'png', kind: 'convert' }, [src]);
    await q.idle();
    const outs = q.resultOf(jobIds[0] as string)?.outputs ?? [];
    expect(outs).toHaveLength(3);
    expect(await q.undo(jobIds[0] as string)).toBe(true);
    for (const o of outs) expect(existsSync(o)).toBe(false);
    expect(existsSync(src)).toBe(true);
  }, 60_000);

  it('reports the folder and the count for the toast, and leaves no scratch folder behind', async () => {
    const src = await makePdf('counted.pdf', ['a', 'b']);
    const q = queue();
    const seen: { outputDir?: string; outputCount?: number }[] = [];
    q.on('update', (snap: { status: string; outputDir?: string; outputCount?: number }) => {
      if (snap.status === 'ok') seen.push(snap);
    });
    q.enqueue({ id: 'png', kind: 'convert' }, [src]);
    await q.idle();
    expect(seen.at(-1)).toMatchObject({ outputDir: dir, outputCount: 2 });
    expect(readdirSync(dir).filter((f) => f.startsWith('~convert'))).toEqual([]);
  }, 60_000);
});

describe('unzip into its own folder, and extract video frames', () => {
  it('puts a lone item beside the archive instead of wrapping it', async () => {
    const solo = join(dir, 'solo-src');
    execFileSync('mkdir', [solo]);
    writeFileSync(join(solo, 'only.txt'), 'one');
    const zip = join(dir, 'solo.zip');
    execFileSync(sevenZipPath() as string, ['a', '-tzip', zip, 'only.txt'], { cwd: solo });
    const r = (await run('extract-here', 'convert', [zip]))[0] as JobResult;
    ok(r);
    expect(r.outputs?.map((o) => basename(o))).toEqual(['only.txt']);
    expect(dirname(r.outputs?.[0] as string)).toBe(dirname(zip));
  }, 30_000);

  it('unzips several archives, each into its own folder', async () => {
    const zips: string[] = [];
    for (const n of ['one', 'two', 'three']) {
      const src = join(dir, `src-${n}`);
      execFileSync('mkdir', [src]);
      writeFileSync(join(src, 'a.txt'), n);
      writeFileSync(join(src, 'b.txt'), n);
      const z = join(dir, `${n}-set.zip`);
      execFileSync(sevenZipPath() as string, ['a', '-tzip', z, '.'], { cwd: src });
      zips.push(z);
    }
    const results = await run('extract-here', 'convert', zips);
    expect(results).toHaveLength(3);
    for (const [i, r] of results.entries()) {
      const folder = ok(r);
      expect(basename(folder)).toBe(basename(zips[i] as string, '.zip'));
      expect(readFileSync(join(folder, 'a.txt'), 'utf8')).toBe(['one', 'two', 'three'][i]);
    }
  }, 60_000);

  it('extracts one picture per second into a folder named after the video', async () => {
    const src = makeVideo('frames-src.mp4', 3);
    const r = (await run('frames', 'tool', [src], { every: 1, format: 'png' }))[0] as JobResult;
    const folder = ok(r);
    expect(basename(folder)).toBe('frames-src frames');
    expect(dirname(folder)).toBe(dirname(src));
    const files = readdirSync(folder).sort();
    expect(files).toEqual(['frames-src-0001.png', 'frames-src-0002.png', 'frames-src-0003.png']);
    expect((await sharp(join(folder, files[0] as string)).metadata()).width).toBe(160);
  }, 60_000);

  it('honours the frame limit and the JPG format, and numbers a second run', async () => {
    const src = makeVideo('frames-two.mp4', 4);
    const first = (
      await run('frames', 'tool', [src], { every: 0.5, format: 'jpg', max: 3 })
    )[0] as JobResult;
    expect(readdirSync(ok(first)).filter((f) => f.endsWith('.jpg'))).toHaveLength(3);
    const second = (await run('frames', 'tool', [src], { every: 2 }))[0] as JobResult;
    expect(basename(ok(second))).toBe('frames-two frames (1)');
  }, 60_000);

  it('rejects an absurd interval and audio-only input', async () => {
    const src = makeVideo('frames-bad.mp4', 1);
    expect(((await run('frames', 'tool', [src], { every: 0 }))[0] as JobResult).error?.code).toBe(
      'E_UNSUPPORTED',
    );
    const wav = makeAudio('frames-bad.wav');
    expect(((await run('frames', 'tool', [wav]))[0] as JobResult).error?.code).toBe(
      'E_UNSUPPORTED',
    );
  }, 60_000);
});

describe('zip many files and folders', () => {
  const list = (zip: string): string[] =>
    execFileSync(sevenZipPath() as string, ['l', '-slt', zip])
      .toString()
      .split('\n')
      .filter((l) => l.startsWith('Path = '))
      .map((l) => l.slice(7).trim().replace(/\\/g, '/'))
      .slice(1)
      .sort();

  it('puts several files into one zip named after their folder, beside them', async () => {
    const trip = join(dir, 'Trip');
    execFileSync('mkdir', [trip]);
    const files = ['a.txt', 'b.txt', 'c.txt'].map((n) => {
      writeFileSync(join(trip, n), n);
      return join(trip, n);
    });
    const r = (await run('zip', 'tool', files))[0] as JobResult;
    const out = ok(r);
    expect(basename(out)).toBe('Trip.zip');
    expect(dirname(out)).toBe(trip);
    expect(list(out)).toEqual(['a.txt', 'b.txt', 'c.txt']);
    expect(await run('zip', 'tool', files)).toHaveLength(1);
  }, 30_000);

  it('names a single file or folder after itself and keeps folder contents', async () => {
    const proj = join(dir, 'proj');
    execFileSync('mkdir', ['-p', join(proj, 'sub')]);
    writeFileSync(join(proj, 'sub', 'deep.txt'), 'x');
    writeFileSync(join(proj, 'top.txt'), 'y');
    const out = ok((await run('zip', 'tool', [proj]))[0] as JobResult);
    expect(basename(out)).toBe('proj.zip');
    expect(list(out)).toEqual(['proj', 'proj/sub', 'proj/sub/deep.txt', 'proj/top.txt']);
    const single = join(dir, 'lonely.txt');
    writeFileSync(single, 'z');
    expect(basename(ok((await run('zip', 'tool', [single]))[0] as JobResult))).toBe('lonely.zip');
  }, 30_000);

  it('mixes files and folders, never overwrites, and treats odd names as plain names', async () => {
    const mix = join(dir, 'Mix');
    execFileSync('mkdir', ['-p', join(mix, 'folder')]);
    writeFileSync(join(mix, 'folder', 'in.txt'), '1');
    writeFileSync(join(mix, '@list.txt'), '2');
    writeFileSync(join(mix, '-dash.txt'), '3');
    const items = [join(mix, 'folder'), join(mix, '@list.txt'), join(mix, '-dash.txt')];
    const first = ok((await run('zip', 'tool', items))[0] as JobResult);
    expect(list(first)).toEqual(['-dash.txt', '@list.txt', 'folder', 'folder/in.txt']);
    const second = ok((await run('zip', 'tool', items))[0] as JobResult);
    expect(basename(first)).toBe('Mix.zip');
    expect(basename(second)).toBe('Mix (1).zip');
  }, 30_000);

  it('works for a mixed selection that cannot be converted at all, and leaves sources alone', async () => {
    const odd = join(dir, 'odd.unknownext');
    const other = join(dir, 'other.txt');
    writeFileSync(odd, 'q');
    writeFileSync(other, 'r');
    const r = (await run('zip', 'tool', [odd, other]))[0] as JobResult;
    expect(r.status).toBe('ok');
  }, 30_000);
});

// ---- Text, merge, passwords, delete pages, upscale, background removal --------------------

/** A picture of text, such as a screenshot or a scan. Each string becomes one large line. */
function makeTextImage(name: string, lines: string[], gap = 0): string {
  const lineH = 90 + gap;
  const canvas = createCanvas(1500, 80 + lines.length * lineH);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 56px sans-serif';
  lines.forEach((text, i) => ctx.fillText(text, 40, 110 + i * lineH));
  const p = join(dir, name);
  writeFileSync(p, canvas.toBuffer('image/png'));
  return p;
}

describe('reading text from pictures', () => {
  it('finds band boundaries only inside blank rows', () => {
    const blank = Array.from({ length: 2000 }, (_, y) => y % 200 > 150);
    const cuts = bandCuts(blank, 4);
    expect(cuts.length).toBeGreaterThan(0);
    for (const c of cuts) expect(blank[c]).toBe(true);
    expect(bandCuts(blank, 1)).toEqual([]); // one worker: nothing to split
    expect(
      bandCuts(
        Array.from({ length: 300 }, () => true),
        4,
      ),
    ).toEqual([]); // short pages are read whole
  });

  it('turns a picture into a TXT, keeping the lines in order, and leaves the source alone', async () => {
    const lines = ['HELLO WORLD', 'SECOND LINE HERE', 'THIRD LINE', 'FOURTH ONE', 'FIFTH LAST'];
    const src = makeTextImage('words.png', lines, 120);
    const r = (await run('txt', 'convert', [src]))[0] as JobResult;
    const text = readFileSync(ok(r), 'utf8');
    expect(basename(ok(r))).toBe('words.txt');
    let at = -1;
    for (const line of lines) {
      const found = text.toUpperCase().indexOf(line.split(' ')[0] as string);
      expect(found, line).toBeGreaterThan(at);
      at = found;
    }
  }, 120_000);

  it('says so when a picture has no text', async () => {
    const blank = await makePng('plain.png', 400, 300);
    const r = (await run('txt', 'convert', [blank]))[0] as JobResult;
    expect(r.status).toBe('error');
    expect(r.error?.code).toBe('E_UNSUPPORTED');
  }, 60_000);

  it('copies text to the clipboard from pictures and documents, with no output file', async () => {
    const pic = makeTextImage('copyme.png', ['CLIPBOARD TEXT']);
    const doc = join(dir, 'copydoc.md');
    writeFileSync(doc, '# Heading\n\nBody text');
    clipboard.length = 0;
    const one = (await run('copy-text', 'tool', [pic]))[0] as JobResult;
    expect(one.status).toBe('ok');
    expect(one.outputs).toBeUndefined();
    expect(clipboard[0]?.toUpperCase()).toContain('CLIPBOARD');
    const both = (await run('copy-text', 'tool', [pic, doc]))[0] as JobResult;
    expect(both.status).toBe('ok');
    expect(clipboard[1]).toContain('copyme.png\n');
    expect(clipboard[1]).toContain('copydoc.md\n');
    expect(clipboard[1]).toContain('Body text');
    expect(existsSync(join(dir, 'copyme.txt'))).toBe(false);
  }, 120_000);
});

describe('everything to TXT, and Markdown to PDF', () => {
  it('turns a spreadsheet into readable text', async () => {
    const csv = join(dir, 'sheet.csv');
    writeFileSync(csv, 'name,qty\nApple,3\n"Pear, green",4\n');
    const out = ok((await run('txt', 'convert', [csv]))[0] as JobResult);
    expect(readFileSync(out, 'utf8')).toBe('name\tqty\nApple\t3\nPear, green\t4\n');
  });

  it('renders Markdown to a PDF with the built-in renderer', async () => {
    const seen: string[] = [];
    setHtmlToPdf(async (html, pdf) => {
      seen.push(readFileSync(html, 'utf8'));
      const doc = await PDFDocument.create();
      doc.addPage();
      writeFileSync(pdf, await doc.save());
    });
    try {
      const md = join(dir, 'notes.md');
      writeFileSync(md, '# Title\n\n- one\n- two\n');
      const out = ok((await run('pdf', 'convert', [md]))[0] as JobResult);
      expect(magic(out, 4).toString()).toBe('%PDF');
      expect(seen[0]).toContain('<h1>Title</h1>');
      expect(seen[0]).toContain('<li>one</li>');
    } finally {
      setHtmlToPdf(null);
    }
  });
});

describe('merge', () => {
  it('joins text and Markdown files in the given order', async () => {
    const a = join(dir, 'm-a.txt');
    const b = join(dir, 'm-b.txt');
    writeFileSync(a, 'first\r\n');
    writeFileSync(b, 'second');
    const out = ok((await run('merge', 'tool', [b, a]))[0] as JobResult);
    expect(basename(out)).toBe('m-b-merged.txt');
    expect(readFileSync(out, 'utf8')).toBe('second\n\nfirst\n');
    const md1 = join(dir, 'x1.md');
    const md2 = join(dir, 'x2.md');
    writeFileSync(md1, '# One');
    writeFileSync(md2, '# Two');
    expect(basename(ok((await run('merge', 'tool', [md1, md2]))[0] as JobResult))).toBe(
      'x1-merged.md',
    );
  });

  it('joins videos of different sizes, with and without sound, into one that plays through', async () => {
    const a = makeVideo('v-a.mp4', 2, '160x120', true);
    const b = makeVideo('v-b.mp4', 1, '320x240', false);
    const out = ok((await run('merge', 'tool', [a, b]))[0] as JobResult);
    expect(basename(out)).toBe('v-a-merged.mp4');
    const total = (await probeDuration(out)) ?? 0;
    expect(total).toBeGreaterThan(2.6);
    expect(total).toBeLessThan(3.6);
    const banner = spawnSync(ffmpeg(), ['-hide_banner', '-i', out]).stderr.toString();
    expect(banner).toMatch(/Video: h264.*160x120/); // the second clip was fitted into the first one's frame
    expect(banner).toMatch(/Audio: aac/); // the silent clip got silence, so the sound runs through
  }, 120_000);

  it('joins audio files', async () => {
    const a = makeAudio('a-a.mp3', 1);
    const b = makeAudio('a-b.mp3', 2);
    const out = ok((await run('merge', 'tool', [a, b]))[0] as JobResult);
    expect(basename(out)).toBe('a-a-merged.mp3');
    const total = (await probeDuration(out)) ?? 0;
    expect(total).toBeGreaterThan(2.7);
    expect(total).toBeLessThan(3.5);
  }, 60_000);

  it('refuses a file with nothing to merge', async () => {
    const a = makeVideo('n-a.mp4', 1);
    const wav = makeAudio('n-b.mp3', 1);
    const pic = await makePng('n-c.png');
    void wav;
    void pic;
    const r = (await run('merge', 'tool', [a, join(dir, 'n-b.mp3')]))[0] as JobResult;
    expect(r.status).toBe('error');
  }, 60_000);
});

describe('passwords', () => {
  it('adds a password to a PDF and removes it again, and rejects a wrong one', async () => {
    const src = await makePdf('secret.pdf', ['one', 'two', 'three']);
    const locked = ok(
      (await run('password', 'tool', [src], { mode: 'add', password: 'hunter2' }))[0] as JobResult,
    );
    expect(basename(locked)).toBe('secret-protected.pdf');
    const bytes = readFileSync(locked);
    await expect(PDFDocument.load(bytes)).rejects.toThrow(/encrypted/i);

    const asked = (
      await run('password', 'tool', [locked], { mode: 'remove', password: 'nope' })
    )[0] as JobResult;
    expect(asked.error?.code).toBe('E_WRONG_PASSWORD');

    const open = ok(
      (
        await run('password', 'tool', [locked], { mode: 'remove', password: 'hunter2' })
      )[0] as JobResult,
    );
    expect(basename(open)).toBe('secret-protected-unlocked.pdf');
    expect((await PDFDocument.load(readFileSync(open))).getPageCount()).toBe(3);
  }, 60_000);

  it('does not protect an already protected PDF, or unlock one with no password', async () => {
    const src = await makePdf('plain-pw.pdf', ['x']);
    const r = (
      await run('password', 'tool', [src], { mode: 'remove', password: 'a' })
    )[0] as JobResult;
    expect(r.status).toBe('error');
    expect(r.error?.message).toMatch(/no password/);
  });

  it('adds an AES password to a ZIP, needs it to open, and removes it again', async () => {
    const folder = join(dir, 'zp');
    execFileSync('mkdir', ['-p', join(folder, 'inner')]);
    writeFileSync(join(folder, 'a.txt'), 'alpha');
    writeFileSync(join(folder, 'inner', 'b.txt'), 'beta');
    const zip = ok(
      (await run('zip', 'tool', [join(folder, 'a.txt'), join(folder, 'inner')]))[0] as JobResult,
    );
    const locked = ok(
      (
        await run('password', 'tool', [zip], { mode: 'add', password: 'p@ss word' })
      )[0] as JobResult,
    );
    expect(basename(locked)).toBe('zp-protected.zip');
    const sevenZip = sevenZipPath() as string;
    const listing = execFileSync(sevenZip, ['l', '-slt', locked]).toString();
    expect(listing).toMatch(/Encrypted = \+/);
    expect(listing).toMatch(/Method = .*AES-256/);

    const wrong = (
      await run('password', 'tool', [locked], { mode: 'remove', password: 'bad' })
    )[0] as JobResult;
    expect(wrong.error?.code).toBe('E_WRONG_PASSWORD');

    const open = ok(
      (
        await run('password', 'tool', [locked], { mode: 'remove', password: 'p@ss word' })
      )[0] as JobResult,
    );
    expect(basename(open)).toBe('zp-protected-unlocked.zip');
    expect(execFileSync(sevenZip, ['l', '-slt', open]).toString()).not.toMatch(/Encrypted = \+/);
    expect(list(open)).toEqual(['a.txt', 'inner', 'inner/b.txt']);
  }, 120_000);

  function list(zip: string): string[] {
    return execFileSync(sevenZipPath() as string, ['l', '-slt', zip])
      .toString()
      .split('\n')
      .filter((l) => l.startsWith('Path = '))
      .map((l) => l.slice(7).trim().replace(/\\/g, '/'))
      .slice(1)
      .sort();
  }
});

describe('delete pages', () => {
  it('saves only the kept pages as a new PDF and leaves the original alone', async () => {
    const src = await makePdf('five-del.pdf', ['p1', 'p2', 'p3', 'p4', 'p5']);
    const out = ok((await run('delete-pages', 'tool', [src], { keep: '1-2,5' }))[0] as JobResult);
    expect(basename(out)).toBe('five-del-edited.pdf');
    expect((await PDFDocument.load(readFileSync(out))).getPageCount()).toBe(3);
    const none = (await run('delete-pages', 'tool', [src], { keep: '1-5' }))[0] as JobResult;
    expect(none.status).toBe('error');
    const nothing = (await run('delete-pages', 'tool', [src], { keep: '' }))[0] as JobResult;
    expect(nothing.status).toBe('error');
  });
});

describe('upscale and background removal', () => {
  it('enlarges many images at once and names each with its factor', async () => {
    const a = await makePng('up-a.png', 40, 30);
    const b = await makePng('up-b.png', 20, 10);
    const results = await run('upscale', 'tool', [a, b], { factor: 3, sharpen: true });
    const sizes = await Promise.all(results.map(async (r) => sharp(ok(r)).metadata()));
    expect(sizes.map((m) => [m.width, m.height])).toEqual([
      [120, 90],
      [60, 30],
    ]);
    expect(results.map((r) => basename(ok(r)))).toEqual(['up-a-3x.png', 'up-b-3x.png']);
  });

  it('refuses a result that would be absurdly large', async () => {
    const big = await makePng('up-big.png', 5000, 5000);
    const r = (await run('upscale', 'tool', [big], { factor: 4 }))[0] as JobResult;
    expect(r.status).toBe('error');
  }, 60_000);

  it('makes a plain background transparent and keeps the subject, for many images', async () => {
    const make = async (name: string, bg: string) => {
      const p = join(dir, name);
      await sharp({ create: { width: 60, height: 60, channels: 3, background: bg } })
        .composite([
          {
            input: await sharp({
              create: { width: 20, height: 20, channels: 3, background: '#d02020' },
            })
              .png()
              .toBuffer(),
            left: 20,
            top: 20,
          },
        ])
        .png()
        .toFile(p);
      return p;
    };
    const white = await make('bg-white.png', '#ffffff');
    const green = await make('bg-green.png', '#20a040');
    const results = await run('remove-bg', 'tool', [white, green], { tolerance: 15, feather: 0 });
    for (const r of results) {
      expect(basename(ok(r))).toMatch(/-nobg\.png$/);
      const { data, info } = await sharp(ok(r))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
      expect(alphaAt(2, 2)).toBe(0);
      expect(alphaAt(30, 30)).toBe(255);
    }
  });

  it('says so when there is no plain background', async () => {
    const noisy = join(dir, 'noisy.png');
    await sharp(randomBytes(60 * 60 * 3), { raw: { width: 60, height: 60, channels: 3 } })
      .png()
      .toFile(noisy);
    const r = (await run('remove-bg', 'tool', [noisy], { tolerance: 3 }))[0] as JobResult;
    expect(r.status).toBe('error');
  });
});

// ---- Files with pictures, charts and several sheets ---------------------------------------

describe('files that hold more than text', () => {
  const sheetFiles = (r: JobResult): string[] => (r.outputs ?? []).map((o) => basename(o)).sort();

  async function workbook(
    name: string,
    sheets: Record<string, (string | number)[][]>,
    withPicture = false,
  ) {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    for (const [title, rows] of Object.entries(sheets)) wb.addWorksheet(title).addRows(rows);
    if (withPicture) {
      const id = wb.addImage({
        buffer: (await sharp({ create: { width: 8, height: 8, channels: 3, background: '#f00' } })
          .png()
          .toBuffer()) as never,
        extension: 'png',
      });
      wb.worksheets[0]?.addImage(id, 'D2:E4');
    }
    const p = join(dir, name);
    await wb.xlsx.writeFile(p);
    return p;
  }

  it('exports every sheet of a workbook, one file each, and a single sheet keeps the workbook name', async () => {
    const book = await workbook('multi.xlsx', {
      Sales: [
        ['q', 'v'],
        ['Q1', 10],
      ],
      'Costs 2024': [['rent', 5]],
      Notes: [['hello']],
    });
    const r = (await run('csv', 'convert', [book]))[0] as JobResult;
    expect(sheetFiles(r)).toEqual([
      'multi - Costs 2024.csv',
      'multi - Notes.csv',
      'multi - Sales.csv',
    ]);
    expect(readFileSync(r.outputs?.find((o) => o.endsWith('Sales.csv')) as string, 'utf8')).toBe(
      '\ufeffq,v\r\nQ1,10',
    );
    const single = await workbook('single.xlsx', { Only: [['a', 1]] });
    expect(sheetFiles((await run('tsv', 'convert', [single]))[0] as JobResult)).toEqual([
      'single.tsv',
    ]);
  });

  it('puts all sheets in the text version, under a heading each', async () => {
    const book = await workbook('multi-txt.xlsx', { A: [['1']], B: [['2']] });
    const text = readFileSync(ok((await run('txt', 'convert', [book]))[0] as JobResult), 'utf8');
    expect(text).toBe('## A\n1\n\n## B\n2\n');
  });

  it('says when a workbook has pictures that the text version leaves out', async () => {
    const book = await workbook('pic.xlsx', { A: [['1']] }, true);
    const r = (await run('csv', 'convert', [book]))[0] as JobResult;
    expect(r.status).toBe('ok');
    expect(r.warning).toMatch(/Pictures were left out/);
  });

  it('says when files are attached to a PDF', async () => {
    const canvas = createCanvas(600, 220);
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 600, 220);
    g.fillStyle = '#000';
    g.font = 'bold 70px sans-serif';
    g.fillText('REVENUE CHART', 20, 120);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const withPicture = doc.addPage([400, 300]);
    withPicture.drawText('Native heading', { x: 20, y: 260, size: 16, font });
    withPicture.drawImage(await doc.embedPng(canvas.toBuffer('image/png')), {
      x: 20,
      y: 40,
      width: 360,
      height: 132,
    });
    const scanned = doc.addPage([400, 300]);
    scanned.drawImage(await doc.embedPng(canvas.toBuffer('image/png')), {
      x: 20,
      y: 80,
      width: 360,
      height: 132,
    });
    await doc.attach(Buffer.from('not really a sheet'), 'data.xlsx', {
      mimeType: 'application/vnd.ms-excel',
    });
    const pdf = join(dir, 'pictures.pdf');
    writeFileSync(pdf, await doc.save());
    // Reading the pictures themselves needs a browser to draw them, so that part is checked in the app (scripts/smoke.cjs).
    const r = (await run('txt', 'convert', [pdf]))[0] as JobResult;
    expect(readFileSync(ok(r), 'utf8')).toContain('Native heading');
    expect(r.warning).toMatch(/attached/);
  }, 180_000);

  it('does not repeat words the page already has as text', async () => {
    const { newLines } = await import('../src/main/engines/pdf');
    expect(newLines('Total revenue\nQ1 120\nx', 'Total  Revenue was strong')).toEqual(['Q1 120']);
  });

  it('says when a Word file has charts or an embedded Excel sheet that text, HTML and EPUB cannot hold', async () => {
    const { Document, Packer, Paragraph } = await import('docx');
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(
      await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('body')] }] })),
    );
    zip.file('word/charts/chart1.xml', '<c/>');
    zip.file('word/embeddings/Microsoft_Excel_Sheet1.xlsx', 'x');
    const p = join(dir, 'with-embeds.docx');
    writeFileSync(p, await zip.generateAsync({ type: 'nodebuffer' }));
    const r = (await run('txt', 'convert', [p]))[0] as JobResult;
    expect(r.status).toBe('ok');
    expect(r.warning).toBe('Charts and embedded files (such as Excel sheets) were left out.');
    expect(readFileSync(ok(r), 'utf8')).toContain('body');
  });
});
