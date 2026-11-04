import { describe, expect, it } from 'vitest';
import { parseCli } from '../src/main/services/cli';

describe('command line', () => {
  it('reads the format and the files Explorer passes', () => {
    expect(parseCli(['Convert.exe', '--convert', 'pdf', 'C:\\a b.png', 'C:\\c.jpg'])).toEqual({
      convert: { target: 'pdf', files: ['C:\\a b.png', 'C:\\c.jpg'] },
    });
    expect(parseCli(['--hidden', '--convert=PNG', '/tmp/x.jpg'])).toEqual({
      convert: { target: 'png', files: ['/tmp/x.jpg'] },
    });
  });

  it('ignores flags among the files, and requests that are not usable', () => {
    expect(parseCli(['--convert', 'mp3', '--hidden', '/a.wav']).convert?.files).toEqual(['/a.wav']);
    expect(parseCli(['--hidden'])).toEqual({});
    expect(parseCli(['--convert', 'pdf'])).toEqual({});
    expect(parseCli(['--convert', '../etc', '/a.wav'])).toEqual({});
    expect(parseCli(['--convert'])).toEqual({});
  });
});
