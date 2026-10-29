import { describe, expect, it } from 'vitest';
import {
  buildFfmpegArgs,
  mediaKindOf,
  parseDuration,
  parseProgressLine,
} from '../src/main/engines/av-args';
import { JobError, type Operation } from '../src/main/jobs/types';

const convert = (id: string): Operation => ({ id, kind: 'convert' });
const tool = (id: string, params = {}): Operation => ({ id, kind: 'tool', params });
const args = (op: Operation, input: string, outExt: string) =>
  buildFfmpegArgs({ op, input, output: `out.${outExt}`, outExt });

describe('buildFfmpegArgs', () => {
  it('passes file names as single array elements, never joined', () => {
    const a = args(convert('mp3'), 'C:\\my music\\a & b.wav', 'mp3');
    expect(a).toContain('C:\\my music\\a & b.wav');
    expect(a.at(-1)).toBe('out.mp3');
  });
  it('uses 192k for audio to mp3', () => {
    expect(args(convert('mp3'), 'a.wav', 'mp3').join(' ')).toContain('libmp3lame -b:a 192k');
  });
  it('uses H.264, AAC, faststart and CRF 23 for video to mp4', () => {
    const j = args(convert('mp4'), 'a.mov', 'mp4').join(' ');
    expect(j).toContain('libx264 -crf 23');
    expect(j).toContain('aac');
    expect(j).toContain('+faststart');
  });
  it('builds a palette GIF at 15 fps capped at 640 wide', () => {
    const j = args(convert('gif'), 'a.mp4', 'gif').join(' ');
    expect(j).toContain('fps=15');
    expect(j).toContain('min(640,iw)');
    expect(j).toContain('palettegen');
  });
  it('extracts audio from video to mp3', () => {
    expect(args(convert('mp3'), 'a.mp4', 'mp3')).toContain('-vn');
  });
  it('compresses video at CRF 28 with the same codec family', () => {
    expect(args(tool('compress'), 'a.mp4', 'mp4').join(' ')).toContain('libx264 -crf 28');
    expect(args(tool('compress'), 'a.webm', 'webm').join(' ')).toContain('libvpx-vp9');
  });
  it('trims with validated seconds and rejects bad ranges', () => {
    const a = args(tool('trim', { start: 5, end: 12 }), 'a.mp4', 'mp4');
    expect(a.slice(a.indexOf('-ss'), a.indexOf('-ss') + 4)).toEqual(['-ss', '5', '-to', '12']);
    expect(() => args(tool('trim', { start: 9, end: 3 }), 'a.mp4', 'mp4')).toThrow(JobError);
    expect(() => args(tool('trim', { start: -1, end: 3 }), 'a.mp4', 'mp4')).toThrow(JobError);
  });
  it('normalizes audio with loudnorm', () => {
    expect(args(tool('normalize'), 'a.mp3', 'mp3').join(' ')).toContain('loudnorm');
  });
  it('rejects unsupported combinations with E_UNSUPPORTED', () => {
    try {
      args(convert('png'), 'a.mp3', 'png');
      throw new Error('should throw');
    } catch (e) {
      expect(e).toMatchObject({ code: 'E_UNSUPPORTED' });
    }
  });
});

describe('progress helpers', () => {
  it('parses microsecond progress against the duration and caps at 99', () => {
    expect(parseProgressLine('out_time_us=5000000', 10)).toBe(50);
    expect(parseProgressLine('out_time_ms=20000000', 10)).toBe(99);
    expect(parseProgressLine('frame=12', 10)).toBeNull();
    expect(parseProgressLine('out_time_us=100', null)).toBeNull();
  });
  it('reads the banner duration', () => {
    expect(parseDuration('  Duration: 00:01:30.50, start: 0')).toBe(90.5);
    expect(parseDuration('nothing')).toBeNull();
  });
  it('classifies media', () => {
    expect(mediaKindOf('a.flac')).toBe('audio');
    expect(mediaKindOf('a.mkv')).toBe('video');
    expect(mediaKindOf('a.png')).toBeNull();
  });
});
