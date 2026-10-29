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
    ['srt', 'vtt'].includes(extensionOf(input)) &&
    ['srt', 'vtt', 'txt'].includes(op.id),
  async run(op, input, ctx) {
    const cues = parseCues(await readFile(input, 'utf8'));
    const out = op.id === 'srt' ? toSrt(cues) : op.id === 'vtt' ? toVtt(cues) : toText(cues);
    await writeFile(ctx.tempPath, out, 'utf8');
  },
};
