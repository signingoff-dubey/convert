import { extensionOf } from '../../shared/formats';
import { JobError, type Operation } from '../jobs/types';

/** Pure ffmpeg argument builders (no process spawning), so they can be unit-tested. */

const AUDIO_CODECS: Record<string, string[]> = {
  mp3: ['-c:a', 'libmp3lame', '-b:a', '192k'],
  m4a: ['-c:a', 'aac', '-b:a', '192k'],
  wav: ['-c:a', 'pcm_s16le'],
  flac: ['-c:a', 'flac'],
  ogg: ['-c:a', 'libvorbis', '-q:a', '5'],
  opus: ['-c:a', 'libopus', '-b:a', '128k'],
  wma: ['-c:a', 'wmav2', '-b:a', '192k'],
  aiff: ['-c:a', 'pcm_s16be'],
};

const AUDIO_COMPRESS: Record<string, string[]> = {
  mp3: ['-c:a', 'libmp3lame', '-b:a', '128k'],
  m4a: ['-c:a', 'aac', '-b:a', '128k'],
  wav: ['-c:a', 'pcm_s16le', '-ar', '22050'],
  flac: ['-c:a', 'flac', '-compression_level', '12'],
  ogg: ['-c:a', 'libvorbis', '-q:a', '3'],
  opus: ['-c:a', 'libopus', '-b:a', '64k'],
  wma: ['-c:a', 'wmav2', '-b:a', '128k'],
  aiff: ['-c:a', 'pcm_s16be', '-ar', '22050'],
};

/** H.264 and VP9 need even dimensions and 4:2:0 pixels to play everywhere; GIF input often has neither. */
const EVEN_420 = ['-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuv420p'];

function videoCodecs(ext: string, crf: number, scaled = true): string[] {
  // A merge scales inside its own filter graph, so it only asks for the pixel format here.
  const EVEN = scaled ? EVEN_420 : ['-pix_fmt', 'yuv420p'];
  if (ext === 'webm') {
    return [...EVEN, '-c:v', 'libvpx-vp9', '-crf', String(crf + 9), '-b:v', '0', '-c:a', 'libopus'];
  }
  if (ext === 'wmv') return [...EVEN, '-c:v', 'wmv2', '-c:a', 'wmav2'];
  if (ext === 'avi') return [...EVEN, '-c:v', 'libx264', '-crf', String(crf), '-c:a', 'libmp3lame'];
  return [
    ...EVEN,
    '-c:v',
    'libx264',
    '-crf',
    String(crf),
    '-preset',
    'medium',
    '-c:a',
    'aac',
    ...(ext === 'mp4' || ext === 'mov' ? ['-movflags', '+faststart'] : []),
  ];
}

export type MediaKind = 'audio' | 'video';

export function mediaKindOf(path: string): MediaKind | null {
  const ext = extensionOf(path);
  if (ext in AUDIO_CODECS) return 'audio';
  if (['mp4', 'mov', 'mkv', 'webm', 'avi', 'wmv', 'gif'].includes(ext)) return 'video';
  return null;
}

const GIF_FILTER =
  "fps=15,scale='min(640,iw)':-2:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse";

const COMMON = ['-hide_banner', '-nostdin', '-y', '-progress', 'pipe:1', '-nostats'];

export interface BuildArgs {
  op: Operation;
  input: string;
  output: string;
  /** Output extension without dot. */
  outExt: string;
}

/** Returns the full argument array for one ffmpeg run. Throws E_UNSUPPORTED for unknown operations. */
export function buildFfmpegArgs({ op, input, output, outExt }: BuildArgs): string[] {
  const inExt = extensionOf(input);
  const kind = mediaKindOf(input);
  const head = [...COMMON, '-i', input];

  if (op.kind === 'convert') {
    if (kind === 'video' && outExt === 'gif') return [...head, '-vf', GIF_FILTER, '-an', output];
    if (kind === 'video' && outExt === 'mp3')
      return [...head, '-vn', ...(AUDIO_CODECS.mp3 ?? []), output];
    if (kind === 'video' && ['mp4', 'mov', 'mkv', 'webm', 'avi', 'wmv'].includes(outExt)) {
      return [...head, '-map', '0:v:0', '-map', '0:a?', ...videoCodecs(outExt, 23), output];
    }
    if (kind === 'audio' && outExt in AUDIO_CODECS) {
      return [...head, '-vn', '-map_metadata', '0', ...(AUDIO_CODECS[outExt] ?? []), output];
    }
    throw new JobError('E_UNSUPPORTED', `${inExt} to ${outExt}`);
  }

  switch (op.id) {
    case 'compress':
      if (kind === 'video') return [...head, ...videoCodecs(inExt, 28), output];
      if (kind === 'audio')
        return [...head, '-vn', '-map_metadata', '0', ...(AUDIO_COMPRESS[inExt] ?? []), output];
      break;
    case 'extract-audio':
      return [...head, '-vn', ...(AUDIO_CODECS.mp3 ?? []), output];
    case 'frames': {
      // `output` is a numbered pattern such as "clip-%04d.png". One picture every `every` seconds, or every frame.
      if (kind !== 'video') break;
      const all = op.params?.all === true || op.params?.all === 'true';
      const every = Number(op.params?.every ?? 1);
      const max = Math.round(Number(op.params?.max ?? 2000));
      if (!all && !(every >= 0.04 && every <= 3600))
        throw new JobError('E_UNSUPPORTED', 'frame interval');
      if (!(max >= 1 && max <= 20000)) throw new JobError('E_UNSUPPORTED', 'frame count');
      return [
        ...head,
        ...(all ? ['-fps_mode', 'passthrough'] : ['-vf', `fps=1/${every}`]),
        '-frames:v',
        String(max),
        ...(op.params?.format === 'jpg' ? ['-q:v', '2'] : []),
        output,
      ];
    }
    case 'normalize':
      if (kind === 'audio') {
        return [
          ...head,
          '-vn',
          '-af',
          'loudnorm=I=-16:TP=-1.5:LRA=11',
          ...(AUDIO_CODECS[inExt] ?? []),
          output,
        ];
      }
      break;
    case 'trim': {
      const start = Number(op.params?.start ?? 0);
      const end = Number(op.params?.end ?? 0);
      if (!(end > start) || start < 0) throw new JobError('E_UNSUPPORTED', 'trim range');
      const range = ['-ss', String(start), '-to', String(end)];
      const codecs =
        kind === 'audio' ? ['-vn', ...(AUDIO_CODECS[inExt] ?? [])] : videoCodecs(inExt, 23);
      return [...COMMON, ...range, '-i', input, ...codecs, output];
    }
  }
  throw new JobError('E_UNSUPPORTED', `${op.id} on ${inExt}`);
}

/** Parses `-progress pipe:1` lines into a percentage, given the probed duration in seconds. */
export function parseProgressLine(line: string, durationSec: number | null): number | null {
  const m = /^out_time_(?:us|ms)=(\d+)$/.exec(line);
  if (!m || !durationSec || durationSec <= 0) return null;
  // Both keys report microseconds despite the "ms" name.
  const seconds = Number(m[1]) / 1_000_000;
  return Math.max(0, Math.min(99, Math.round((seconds / durationSec) * 100)));
}

/** Pulls `Duration: hh:mm:ss.xx` out of ffmpeg's banner. */
export function parseDuration(stderr: string): number | null {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export interface MergeInput {
  path: string;
  hasAudio: boolean;
  durationSec: number;
}

export interface MergeArgs {
  inputs: readonly MergeInput[];
  kind: MediaKind;
  outExt: string;
  output: string;
  /** Frame size every video is fitted into (even numbers). */
  width: number;
  height: number;
}

/**
 * Joins files end to end. Every video is fitted into one frame size (padded, never stretched) at 30 fps,
 * and a file with no sound gets silence of the same length, so mixed clips line up.
 */
export function buildMergeArgs({
  inputs,
  kind,
  outExt,
  output,
  width,
  height,
}: MergeArgs): string[] {
  if (inputs.length < 2) throw new JobError('E_UNSUPPORTED', 'merge needs two or more files');
  const head = [...COMMON, ...inputs.flatMap((i) => ['-i', i.path])];
  const parts: string[] = [];
  const labels: string[] = [];
  inputs.forEach((input, i) => {
    if (kind === 'video') {
      parts.push(
        `[${i}:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`,
      );
      labels.push(`[v${i}]`);
    }
    const sound = '' + 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
    if (input.hasAudio) parts.push(`[${i}:a:0]${sound}[a${i}]`);
    else {
      const len = Math.max(0.04, input.durationSec).toFixed(3);
      parts.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${len},asetpts=N/SR/TB[a${i}]`);
    }
    labels.push(`[a${i}]`);
  });
  const graph = `${parts.join(';')};${labels.join('')}concat=n=${inputs.length}:v=${kind === 'video' ? 1 : 0}:a=1[${kind === 'video' ? 'v][a' : 'a'}]`;
  const maps = kind === 'video' ? ['-map', '[v]', '-map', '[a]'] : ['-map', '[a]'];
  const codecs =
    kind === 'video'
      ? videoCodecs(outExt, 23, false)
      : (AUDIO_CODECS[outExt] ?? AUDIO_CODECS.mp3 ?? []);
  return [...head, '-filter_complex', graph, ...maps, ...codecs, output];
}
