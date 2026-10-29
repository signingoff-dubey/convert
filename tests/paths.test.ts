import { describe, expect, it } from 'vitest';
import { checkDropPath } from '../src/main/jobs/paths';

describe('checkDropPath', () => {
  it('accepts normal drive and UNC paths and normalizes them', () => {
    expect(checkDropPath('C:/Users/me/a b.png')).toEqual({
      ok: true,
      path: 'C:\\Users\\me\\a b.png',
    });
    expect(checkDropPath('\\\\srv\\share\\a.png').ok).toBe(true);
  });
  it('rejects empty, null bytes, device prefixes and relative paths', () => {
    expect(checkDropPath('  ')).toEqual({ ok: false, reason: 'empty' });
    expect(checkDropPath('C:\\a\u0000b')).toEqual({ ok: false, reason: 'null-byte' });
    expect(checkDropPath('\\\\.\\PhysicalDrive0')).toEqual({ ok: false, reason: 'device-prefix' });
    expect(checkDropPath('\\\\?\\C:\\a')).toEqual({ ok: false, reason: 'device-prefix' });
    expect(checkDropPath('..\\a.png')).toEqual({ ok: false, reason: 'not-absolute' });
  });
  it('rejects protected locations even through .. tricks, but not lookalikes', () => {
    expect(checkDropPath('C:\\Windows\\System32\\a.dll')).toEqual({
      ok: false,
      reason: 'protected-location',
    });
    expect(checkDropPath('c:\\users\\me\\..\\..\\windows\\x')).toEqual({
      ok: false,
      reason: 'protected-location',
    });
    expect(checkDropPath('C:\\Program Files (x86)\\App\\a')).toMatchObject({ ok: false });
    expect(checkDropPath('C:\\Windows Stuff\\a.png').ok).toBe(true);
  });
});
