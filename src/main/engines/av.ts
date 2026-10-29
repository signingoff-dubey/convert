import { stat } from 'node:fs/promises';
import { extensionOf } from '../../shared/formats';
import { JobError, type Engine, type RunContext } from '../jobs/types';
import { buildFfmpegArgs, mediaKindOf, parseDuration, parseProgressLine } from './av-args';
import { ffmpegPath } from './binaries';
import { execFileSafe } from './exec';

const CONVERT_OUT = new Set([
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
const TOOLS = new Set(['compress', 'extract-audio', 'trim', 'normalize']);

export async function probeDuration(path: string): Promise<number | null> {
  const exe = ffmpegPath();
  if (!exe) return null;
  // ffmpeg exits non-zero with no output file; the banner on stderr still has the duration.
  const res = await execFileSafe(exe, ['-hide_banner', '-i', path]).catch(() => null);
  return res ? parseDuration(res.stderr) : null;
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
    const exe = ffmpegPath();
    if (!exe) throw new JobError('E_ENGINE_MISSING', 'ffmpeg');
    const duration = await probeDuration(input);
    const args = buildFfmpegArgs({
      op,
      input,
      output: ctx.tempPath,
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
