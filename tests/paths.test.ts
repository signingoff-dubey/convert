import { describe, expect, it } from 'vitest';
import { checkDropPath } from '../src/main/jobs/paths';

const w = (input: string) => checkDropPath(input, undefined, 'win32');

describe('checkDropPath', () => {
  it('accepts normal drive and UNC paths and normalizes them', () => {
    expect(w('C:/Users/me/a b.png')).toEqual({
      ok: true,
      path: 'C:\\Users\\me\\a b.png',
    });
    expect(w('\\\\srv\\share\\a.png').ok).toBe(true);
  });
  it('rejects empty, null bytes, device prefixes and relative paths', () => {
    expect(w('  ')).toEqual({ ok: false, reason: 'empty' });
    expect(w('C:\\a\u0000b')).toEqual({ ok: false, reason: 'null-byte' });
    expect(w('\\\\.\\PhysicalDrive0')).toEqual({ ok: false, reason: 'device-prefix' });
    expect(w('\\\\?\\C:\\a')).toEqual({ ok: false, reason: 'device-prefix' });
    expect(w('..\\a.png')).toEqual({ ok: false, reason: 'not-absolute' });
  });
  it('rejects protected locations even through .. tricks, but not lookalikes', () => {
    expect(w('C:\\Windows\\System32\\a.dll')).toEqual({
      ok: false,
      reason: 'protected-location',
    });
    expect(w('c:\\users\\me\\..\\..\\windows\\x')).toEqual({
      ok: false,
      reason: 'protected-location',
    });
    expect(w('C:\\Program Files (x86)\\App\\a')).toMatchObject({ ok: false });
    expect(w('C:\\Windows Stuff\\a.png').ok).toBe(true);
  });
});

describe('checkDropPath on posix (development machines)', () => {
  const p = (input: string) => checkDropPath(input, undefined, 'posix');
  it('accepts absolute paths and rejects relative and protected ones', () => {
    expect(p('/home/me/a b.png')).toEqual({ ok: true, path: '/home/me/a b.png' });
    expect(p('a/b.png')).toEqual({ ok: false, reason: 'not-absolute' });
    expect(p('/etc/passwd')).toEqual({ ok: false, reason: 'protected-location' });
    expect(p('/home/me/../../etc/x')).toEqual({ ok: false, reason: 'protected-location' });
    expect(p('/etcetera/x').ok).toBe(true);
  });
});
