import { describe, expect, it } from 'vitest';
import {
  NamingError,
  pageFileName,
  resolveOutput,
  resolveOutputDir,
  sanitizeName,
  toExtendedPath,
} from '../src/main/jobs/naming';

const base = {
  location: 'nextToSource',
  customFolder: null,
  useConvertedSubfolder: false,
} as const;
const none = () => false;

describe('resolveOutput', () => {
  it('uses the source folder with the new lowercase extension', () => {
    expect(resolveOutput('C:\\p\\photo.HEIC', '.PNG', base, none)).toBe('C:\\p\\photo.png');
  });
  it('numbers one and many collisions', () => {
    const taken = new Set(['C:\\p\\a.png', 'C:\\p\\a (1).png']);
    expect(resolveOutput('C:\\p\\a.jpg', 'png', base, (p) => taken.has(p))).toBe(
      'C:\\p\\a (2).png',
    );
  });
  it('never returns the source for same-extension re-encodes, case-insensitively', () => {
    expect(resolveOutput('C:\\p\\a.jpg', 'jpg', base, none)).toBe('C:\\p\\a (1).jpg');
    expect(resolveOutput('C:\\p\\A.JPG', 'jpg', base, none)).toBe('C:\\p\\A (1).jpg');
  });
  it('supports a Converted subfolder and a custom folder', () => {
    expect(
      resolveOutput('C:\\p\\a.png', 'jpg', { ...base, useConvertedSubfolder: true }, none),
    ).toBe('C:\\p\\Converted\\a.jpg');
    expect(
      resolveOutput(
        'C:\\p\\a.png',
        'jpg',
        { ...base, location: 'custom', customFolder: 'D:\\out' },
        none,
      ),
    ).toBe('D:\\out\\a.jpg');
  });
  it('keeps unicode names and strips trailing dots and spaces', () => {
    expect(resolveOutput('C:\\p\\naïve 写真.png', 'jpg', base, none)).toBe('C:\\p\\naïve 写真.jpg');
    expect(sanitizeName('name. . ')).toBe('name');
    expect(sanitizeName('')).toBe('file');
  });
  it('fixes illegal characters and reserved device names', () => {
    expect(sanitizeName('a<b>c:d')).toBe('a_b_c_d');
    expect(sanitizeName('CON')).toBe('_CON');
    expect(sanitizeName('nul.txt')).toBe('_nul.txt');
    expect(sanitizeName('console')).toBe('console');
  });
  it('uses extended-length paths beyond 259 chars and rejects absurd ones', () => {
    const longDir = `C:\\${'d'.repeat(130)}\\${'e'.repeat(130)}`;
    const out = resolveOutput(`${longDir}\\a.png`, 'jpg', base, none);
    expect(out.startsWith('\\\\?\\C:\\')).toBe(true);
    expect(toExtendedPath('\\\\srv\\share\\' + 'x'.repeat(300))).toMatch(/^\\\\\?\\UNC\\srv/);
    expect(() => toExtendedPath('C:\\' + 'x'.repeat(40000))).toThrow(NamingError);
  });
});

describe('resolveOutputDir / pageFileName', () => {
  it('numbers folders', () => {
    const taken = new Set(['C:\\p\\doc']);
    expect(resolveOutputDir('C:\\p\\doc.pdf', base, (p) => taken.has(p))).toBe('C:\\p\\doc (1)');
  });
  it('pads page numbers to at least three digits', () => {
    expect(pageFileName('doc', 7, 'PNG', 12)).toBe('doc-007.png');
    expect(pageFileName('doc', 7, 'png', 12345)).toBe('doc-00007.png');
  });
});
