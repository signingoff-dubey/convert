import { describe, expect, it } from 'vitest';
import { detectBackground, removeBackground, DEFAULT_BG } from '../src/shared/bg-remove';
import { buildMergeArgs } from '../src/main/engines/av-args';

/** A w by h picture of one colour with a square of another in the middle. */
function picture(
  w: number,
  h: number,
  bg: number[],
  fg: number[],
  box: [number, number, number, number],
) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inside = x >= box[0] && x < box[2] && y >= box[1] && y < box[3];
      const c = inside ? fg : bg;
      data.set([c[0] as number, c[1] as number, c[2] as number, 255], (y * w + x) * 4);
    }
  return data;
}
const alpha = (d: Uint8ClampedArray, w: number, x: number, y: number) => d[(y * w + x) * 4 + 3];

describe('background removal', () => {
  it('reads the background from the edge', () => {
    expect(
      detectBackground(picture(20, 20, [10, 200, 30], [255, 0, 0], [5, 5, 15, 15]), 20, 20),
    ).toEqual([10, 200, 30]);
  });

  it('clears the background and keeps the subject', () => {
    const d = picture(20, 20, [255, 255, 255], [200, 20, 20], [5, 5, 15, 15]);
    const share = removeBackground(d, 20, 20, { ...DEFAULT_BG, feather: 0 });
    expect(share).toBeCloseTo(0.75, 2);
    expect(alpha(d, 20, 0, 0)).toBe(0);
    expect(alpha(d, 20, 10, 10)).toBe(255);
  });

  it('keeps background-coloured areas that do not touch the edge, unless asked to remove the colour everywhere', () => {
    const make = () => {
      const d = picture(30, 30, [255, 255, 255], [0, 0, 0], [5, 5, 25, 25]);
      // A white hole inside the black square.
      for (let y = 12; y < 18; y++)
        for (let x = 12; x < 18; x++) d.set([255, 255, 255, 255], (y * 30 + x) * 4);
      return d;
    };
    const kept = make();
    removeBackground(kept, 30, 30, { ...DEFAULT_BG, feather: 0 });
    expect(alpha(kept, 30, 15, 15)).toBe(255);
    const everywhere = make();
    removeBackground(everywhere, 30, 30, { ...DEFAULT_BG, feather: 0, contiguous: false });
    expect(alpha(everywhere, 30, 15, 15)).toBe(0);
  });

  it('softens the edge with feather and never brings back a removed pixel', () => {
    const d = picture(40, 40, [255, 255, 255], [0, 0, 0], [10, 10, 30, 30]);
    removeBackground(d, 40, 40, { ...DEFAULT_BG, feather: 3 });
    expect(alpha(d, 40, 0, 0)).toBe(0);
    expect(alpha(d, 40, 20, 20)).toBe(255);
    const edge = alpha(d, 40, 10, 20) as number;
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });

  it('honours a colour picked by the user', () => {
    const d = picture(20, 20, [255, 255, 255], [0, 0, 255], [5, 5, 15, 15]);
    removeBackground(d, 20, 20, {
      tolerance: 10,
      feather: 0,
      color: [0, 0, 255],
      contiguous: false,
    });
    expect(alpha(d, 20, 10, 10)).toBe(0);
    expect(alpha(d, 20, 0, 0)).toBe(255);
  });
});

describe('merge arguments', () => {
  const inputs = [
    { path: 'a.mp4', hasAudio: true, durationSec: 2 },
    { path: 'b.mp4', hasAudio: false, durationSec: 1.5 },
  ];
  it('fits every video into one frame and fills silent clips with silence of the same length', () => {
    const args = buildMergeArgs({
      inputs,
      kind: 'video',
      outExt: 'mp4',
      output: 'o.mp4',
      width: 640,
      height: 360,
    });
    const graph = args[args.indexOf('-filter_complex') + 1] as string;
    expect(graph).toContain('scale=640:360:force_original_aspect_ratio=decrease,pad=640:360');
    expect(graph).toContain('[0:a:0]aresample=48000');
    expect(graph).toContain('anullsrc=r=48000:cl=stereo,atrim=duration=1.500');
    expect(graph).toContain('[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]');
    expect(args.filter((a) => a === '-i')).toHaveLength(2);
    expect(args.at(-1)).toBe('o.mp4');
    expect(args).not.toContain('-vf'); // simple filters cannot be mixed with the graph
  });
  it('joins audio only, and refuses a single file', () => {
    const args = buildMergeArgs({
      inputs,
      kind: 'audio',
      outExt: 'mp3',
      output: 'o.mp3',
      width: 0,
      height: 0,
    });
    expect(args[args.indexOf('-filter_complex') + 1]).toContain('[a0][a1]concat=n=2:v=0:a=1[a]');
    expect(args).toContain('libmp3lame');
    expect(() =>
      buildMergeArgs({
        inputs: inputs.slice(0, 1),
        kind: 'audio',
        outExt: 'mp3',
        output: 'o',
        width: 0,
        height: 0,
      }),
    ).toThrow();
  });
});
