import { readFile, writeFile } from 'node:fs/promises';
import { extensionOf } from '../../shared/formats';
import { JobError, type Engine } from '../jobs/types';

interface Cue {
  start: string;
  end: string;
  text: string[];
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, '0');
}

/** Normalizes `mm:ss.mmm`, `hh:mm:ss,mmm` and `hh:mm:ss.mmm` to numeric parts. */
function parseTime(raw: string): { h: number; m: number; s: number; ms: number } | null {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/.exec(raw.trim());
  if (!m) return null;
  return {
    h: Number(m[1] ?? 0),
    m: Number(m[2]),
    s: Number(m[3]),
    ms: Number((m[4] ?? '0').padEnd(3, '0')),
  };
}

function fmt(raw: string, sep: ',' | '.'): string {
  const t = parseTime(raw);
  if (!t) throw new JobError('E_CORRUPT_INPUT', `bad timestamp ${raw}`);
  return `${pad(t.h, 2)}:${pad(t.m, 2)}:${pad(t.s, 2)}${sep}${pad(t.ms, 3)}`;
}

const toMs = (t: { h: number; m: number; s: number; ms: number }): number =>
  ((t.h * 60 + t.m) * 60 + t.s) * 1000 + t.ms;

function fromMs(total: number): string {
  const ms = Math.max(0, Math.round(total));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms % 1000, 3)}`;
}

/** Reads text in UTF-8, or UTF-16 when the file starts with that byte order mark. */
export function decodeText(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    return swapped.swap16().toString('utf16le');
  }
  return buf.toString('utf8');
}

/** Advanced SubStation Alpha (and SSA): the Dialogue lines under [Events]. Styling tags are removed. */
export function parseAss(text: string): Cue[] {
  const cues: Cue[] = [];
  let format: string[] = [];
  let inEvents = false;
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (/^\[.*\]$/.test(line)) inEvents = /^\[events\]$/i.test(line);
    else if (inEvents && /^format\s*:/i.test(line))
      format = line
        .replace(/^format\s*:/i, '')
        .split(',')
        .map((f) => f.trim().toLowerCase());
    else if (inEvents && /^dialogue\s*:/i.test(line)) {
      const body = line.replace(/^dialogue\s*:\s*/i, '');
      const cols =
        format.length > 0
          ? format
          : [
              'layer',
              'start',
              'end',
              'style',
              'name',
              'marginl',
              'marginr',
              'marginv',
              'effect',
              'text',
            ];
      const parts = body.split(',');
      const textAt = cols.indexOf('text');
      const spoken = parts.slice(textAt).join(',');
      const start = parts[cols.indexOf('start')] ?? '';
      const end = parts[cols.indexOf('end')] ?? '';
      const lines = spoken
        .replace(/\{[^}]*\}/g, '')
        .split(/\\N|\\n/)
        .map((l) => l.replace(/\\h/g, ' ').trim())
        .filter(Boolean);
      if (lines.length > 0) cues.push({ start: start.trim(), end: end.trim(), text: lines });
    }
  }
  if (cues.length === 0) throw new JobError('E_CORRUPT_INPUT', 'no dialogue lines found');
  return cues.sort((a, b) => toMs(parseTime(a.start) ?? zero) - toMs(parseTime(b.start) ?? zero));
}

const zero = { h: 0, m: 0, s: 0, ms: 0 };

/** Lyrics: "[mm:ss.xx]line". A line lasts until the next one starts. */
export function parseLrc(text: string): Cue[] {
  const stamps: { at: number; line: string }[] = [];
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (tags.length === 0) continue;
    const line = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const t of tags) {
      const ms = Number((t[3] ?? '0').padEnd(3, '0'));
      stamps.push({ at: (Number(t[1]) * 60 + Number(t[2])) * 1000 + ms, line });
    }
  }
  if (stamps.length === 0) throw new JobError('E_CORRUPT_INPUT', 'no timed lines found');
  stamps.sort((a, b) => a.at - b.at);
  return stamps
    .map((s, i) => ({
      start: fromMs(s.at),
      end: fromMs(stamps[i + 1]?.at ?? s.at + 4000),
      text: [s.line],
    }))
    .filter((c) => c.text[0] !== '');
}

/** YouTube's SBV: "h:mm:ss.mmm,h:mm:ss.mmm" then the text. */
export function parseSbv(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const m = /^(\d+:\d{2}:\d{2}\.\d{1,3}),(\d+:\d{2}:\d{2}\.\d{1,3})$/.exec(
      (lines[0] ?? '').trim(),
    );
    if (m) cues.push({ start: m[1] as string, end: m[2] as string, text: lines.slice(1) });
  }
  if (cues.length === 0) throw new JobError('E_CORRUPT_INPUT', 'no cues found');
  return cues;
}

export function toAss(cues: Cue[]): string {
  const cs = (raw: string): string => {
    const t = parseTime(raw);
    if (!t) throw new JobError('E_CORRUPT_INPUT', `bad timestamp ${raw}`);
    return `${t.h}:${pad(t.m, 2)}:${pad(t.s, 2)}.${pad(Math.floor(t.ms / 10), 2)}`;
  };
  const head =
    '[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n' +
    '[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n' +
    'Style: Default,Arial,64,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,3,1,2,60,60,50,1\n\n' +
    '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  return (
    head +
    cues
      .map((c) => `Dialogue: 0,${cs(c.start)},${cs(c.end)},Default,,0,0,0,,${c.text.join('\\N')}`)
      .join('\n') +
    '\n'
  );
}

export function toLrc(cues: Cue[]): string {
  return (
    cues
      .map((c) => {
        const t = parseTime(c.start);
        if (!t) throw new JobError('E_CORRUPT_INPUT', `bad timestamp ${c.start}`);
        const total = toMs(t);
        const mm = Math.floor(total / 60_000);
        const ss = Math.floor((total % 60_000) / 1000);
        return `[${pad(mm, 2)}:${pad(ss, 2)}.${pad(Math.floor((total % 1000) / 10), 2)}]${c.text
          .join(' ')
          .replace(/<[^>]+>/g, '')}`;
      })
      .join('\n') + '\n'
  );
}

export function parseCues(text: string): Cue[] {
  const blocks = text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const timing = lines.findIndex((l) => l.includes('-->'));
    if (timing < 0) continue; // WEBVTT header, NOTE, STYLE and similar blocks
    const [start, rest] = (lines[timing] as string).split('-->');
    const end = (rest ?? '').trim().split(/\s+/)[0] ?? '';
    cues.push({ start: (start ?? '').trim(), end, text: lines.slice(timing + 1) });
  }
  if (cues.length === 0 && text.trim() !== '' && !/^WEBVTT/.test(text.trim())) {
    throw new JobError('E_CORRUPT_INPUT', 'no cues found');
  }
  return cues;
}

export function toSrt(cues: Cue[]): string {
  return (
    cues
      .map((c, i) => `${i + 1}\n${fmt(c.start, ',')} --> ${fmt(c.end, ',')}\n${c.text.join('\n')}`)
      .join('\n\n') + '\n'
  );
}

export function toVtt(cues: Cue[]): string {
  return (
    'WEBVTT\n\n' +
    cues
      .map((c) => `${fmt(c.start, '.')} --> ${fmt(c.end, '.')}\n${c.text.join('\n')}`)
      .join('\n\n') +
    '\n'
  );
}

export function toText(cues: Cue[]): string {
  return cues.map((c) => c.text.join('\n').replace(/<[^>]+>/g, '')).join('\n\n') + '\n';
}

export const subsEngine: Engine = {
  id: 'subs',
  canHandle: (op, input) =>
    op.kind === 'convert' &&
    ['srt', 'vtt', 'ass', 'lrc', 'sbv'].includes(extensionOf(input)) &&
    ['srt', 'vtt', 'ass', 'lrc', 'txt'].includes(op.id) &&
    extensionOf(input) !== op.id,
  async run(op, input, ctx) {
    const text = decodeText(await readFile(input));
    const ext = extensionOf(input);
    const cues =
      ext === 'ass'
        ? parseAss(text)
        : ext === 'lrc'
          ? parseLrc(text)
          : ext === 'sbv'
            ? parseSbv(text)
            : parseCues(text);
    const out =
      op.id === 'srt'
        ? toSrt(cues)
        : op.id === 'vtt'
          ? toVtt(cues)
          : op.id === 'ass'
            ? toAss(cues)
            : op.id === 'lrc'
              ? toLrc(cues)
              : toText(cues);
    await writeFile(ctx.tempPath, out, 'utf8');
  },
};
