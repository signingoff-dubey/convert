import { describe, expect, it } from 'vitest';
import {
  decodeText,
  parseAss,
  parseCues,
  parseLrc,
  parseSbv,
  toAss,
  toLrc,
  toSrt,
  toText,
  toVtt,
} from '../src/main/engines/subs';

const ASS = `[Script Info]
Title: x

[V4+ Styles]
Format: Name, Fontname
Style: Default,Arial

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:05.50,0:00:07.00,Default,,0,0,0,,{\\i1}Second, with a comma{\\i0}\\Nand a new line
Dialogue: 0,0:00:01.00,0:00:03.25,Default,,0,0,0,,First line
Comment: 0,0:00:09.00,0:00:10.00,Default,,0,0,0,,not spoken
`;

describe('subtitle formats', () => {
  it('reads ASS dialogue in time order, with commas, tags and line breaks handled', () => {
    const cues = parseAss(ASS);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ start: '0:00:01.00', text: ['First line'] });
    expect(cues[1]?.text).toEqual(['Second, with a comma', 'and a new line']);
    expect(toSrt(cues)).toContain('00:00:05,500 --> 00:00:07,000');
    expect(toVtt(cues)).toContain('00:00:01.000 --> 00:00:03.250');
    expect(toText(cues)).toBe('First line\n\nSecond, with a comma\nand a new line\n');
  });

  it('writes ASS that reads back the same', () => {
    const srt =
      '1\n00:00:01,000 --> 00:00:02,500\nHello\nworld\n\n2\n00:01:00,010 --> 00:01:01,000\nBye\n';
    const ass = toAss(parseCues(srt));
    expect(ass).toContain('Dialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,Hello\\Nworld');
    const back = parseAss(ass);
    expect(toSrt(back)).toBe(toSrt(parseCues(srt)).replace('00:01:00,010', '00:01:00,010'));
  });

  it('reads lyrics, giving each line the time until the next', () => {
    const cues = parseLrc(
      '[ar:Someone]\n[00:12.00]Hello there\n[00:15.50][01:00.00]Chorus\n[00:20.00]\n',
    );
    expect(cues.map((c) => c.text[0])).toEqual(['Hello there', 'Chorus', 'Chorus']);
    expect(cues[0]).toMatchObject({ start: '00:00:12.000', end: '00:00:15.500' });
    expect(() => parseLrc('just words')).toThrow();
  });

  it('writes LRC from cues, one line each', () => {
    const lrc = toLrc(parseCues('1\n00:01:02,340 --> 00:01:03,000\nSecond\nline\n'));
    expect(lrc).toBe('[01:02.34]Second line\n');
  });

  it('reads YouTube SBV', () => {
    const cues = parseSbv('0:00:01.000,0:00:03.500\nHi\n\n0:00:04.000,0:00:05.000\nBye\n');
    expect(cues).toHaveLength(2);
    expect(toSrt(cues)).toContain('00:00:01,000 --> 00:00:03,500');
  });

  it('decodes UTF-16 files by their byte order mark', () => {
    const le = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHéllo\n', 'utf16le'),
    ]);
    expect(decodeText(le)).toContain('Héllo');
    const be = Buffer.from(le);
    be.subarray(2).swap16();
    be[0] = 0xfe;
    be[1] = 0xff;
    expect(decodeText(be)).toContain('Héllo');
  });
});
