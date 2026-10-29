import { stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { sanitizeName } from '../jobs/naming';
import { extensionOf } from '../../shared/formats';
import { JobError, type Engine, type RunContext } from '../jobs/types';
import {
  buildFfmpegArgs,
  buildMergeArgs,
  mediaKindOf,
  parseDuration,
  parseProgressLine,
  type MergeInput,
} from './av-args';
import { ffmpegPath } from './binaries';
import { execFileSafe } from './exec';

const CONVERT_OUT = new Set([
  'mov',
  'avi',
  'wmv',
  'aiff',
  'wma',
  'mp3',
  'm4a',
  'wav',
  'flac',
  'ogg',
  'opus',
  'mp4',
  'webm',
  'mkv',
  'gif',
]);
const TOOLS = new Set(['compress', 'extract-audio', 'trim', 'normalize', 'frames', 'merge']);

export async function probeDuration(path: string): Promise<number | null> {
  const exe = ffmpegPath();
  if (!exe) return null;
  // ffmpeg exits non-zero with no output file; the banner on stderr still has the duration.
  const res = await execFileSafe(exe, ['-hide_banner', '-i', path]).catch(() => null);
  return res ? parseDuration(res.stderr) : null;
}

interface StreamInfo extends MergeInput {
  hasVideo: boolean;
  width: number;
  height: number;
}

/** Reads the streams of a file from ffmpeg's banner; there is no separate ffprobe. */
async function probeStreams(exe: string, path: string): Promise<StreamInfo> {
  const res = await execFileSafe(exe, ['-hide_banner', '-i', path]).catch(() => null);
  const text = res?.stderr ?? '';
  const size = /Video: .*?,\s*(\d{2,5})x(\d{2,5})/.exec(text);
  return {
    path,
    durationSec: parseDuration(text) ?? 0,
    hasAudio: /Stream #\S+: Audio:/.test(text),
    hasVideo: /Stream #\S+: Video:(?!.*attached pic)/.test(text),
    width: size ? Number(size[1]) : 0,
    height: size ? Number(size[2]) : 0,
  };
}

async function mergeMedia(op: { id: string }, input: string, ctx: RunContext): Promise<void> {
  const exe = ffmpegPath();
  if (!exe) throw new JobError('E_ENGINE_MISSING', 'ffmpeg');
  const kind = mediaKindOf(input);
  if (!kind) throw new JobError('E_UNSUPPORTED', `${op.id} on ${extensionOf(input)}`);
  const paths = ctx.allInputs.length > 0 ? ctx.allInputs : [input];
  const infos: StreamInfo[] = [];
  for (const p of paths) infos.push(await probeStreams(exe, p));
  const bad = infos.find((i) => (kind === 'video' ? !i.hasVideo : !i.hasAudio));
  if (bad) throw new JobError('E_UNSUPPORTED', `${basename(bad.path)} has no ${kind} to merge`);
  // The first video decides the frame size, rounded down to even numbers.
  const first = infos[0] as StreamInfo;
  const even = (n: number): number => Math.max(2, n - (n % 2));
  const total = infos.reduce((sum, i) => sum + i.durationSec, 0);
  const args = buildMergeArgs({
    inputs: infos,
    kind,
    outExt: extensionOf(ctx.tempPath),
    output: ctx.tempPath,
    width: even(first.width || 1280),
    height: even(first.height || 720),
  });
  const res = await execFileSafe(exe, args, {
    signal: ctx.signal,
    onStdoutLine: (line) => {
      const pct = parseProgressLine(line, total || null);
      if (pct !== null) ctx.onProgress(pct);
    },
  });
  if (res.code !== 0)
    throw new JobError('E_UNKNOWN', res.stderr.trim().split('\n').slice(-3).join(' '));
}

export async function ffmpegVersion(): Promise<string | null> {
  const exe = ffmpegPath();
  if (!exe) return null;
  let first = '';
  await execFileSafe(exe, ['-version'], { onStdoutLine: (l) => (first ||= l) }).catch(() => null);
  return /version\s+(\S+)/.exec(first)?.[1] ?? null;
}

export function avOutputExt(opId: string, kind: 'convert' | 'tool', input: string): string {
  if (kind === 'convert') return opId;
  return opId === 'extract-audio' ? 'mp3' : extensionOf(input);
}

export const avEngine: Engine = {
  id: 'av',
  canHandle(op, input) {
    if (!mediaKindOf(input)) return false;
    return op.kind === 'convert' ? CONVERT_OUT.has(op.id) : TOOLS.has(op.id);
  },
  async run(op, input, ctx: RunContext): Promise<unknown> {
    if (op.kind === 'tool' && op.id === 'merge') return mergeMedia(op, input, ctx);
    const exe = ffmpegPath();
    if (!exe) throw new JobError('E_ENGINE_MISSING', 'ffmpeg');
    const duration = await probeDuration(input);
    const args = buildFfmpegArgs({
      op,
      input,
      // Frames are many numbered pictures, written straight into the job's output folder.
      output:
        op.id === 'frames'
          ? join(
              ctx.outDir,
              `${sanitizeName(basename(input, extname(input)))}-%04d.${op.params?.format === 'jpg' ? 'jpg' : 'png'}`,
            )
          : ctx.tempPath,
      outExt: avOutputExt(op.id, op.kind, input),
    });
    const res = await execFileSafe(exe, args, {
      signal: ctx.signal,
      onStdoutLine: (line) => {
        const pct = parseProgressLine(line, duration);
        if (pct !== null) ctx.onProgress(pct);
      },
    });
    if (res.code !== 0) {
      const tail = res.stderr.trim().split('\n').slice(-3).join(' ');
      if (/does not contain any stream|matches no streams/i.test(res.stderr)) {
        throw new JobError('E_UNSUPPORTED', 'this file has no audio track');
      }
      throw new JobError(
        /Invalid data|moov atom|could not find codec/i.test(res.stderr)
          ? 'E_CORRUPT_INPUT'
          : 'E_UNKNOWN',
        tail,
      );
    }
    if (op.kind === 'tool' && op.id === 'compress') {
      if ((await stat(ctx.tempPath)).size >= (await stat(input)).size)
        return { note: 'already-compact' };
    }
  },
};
