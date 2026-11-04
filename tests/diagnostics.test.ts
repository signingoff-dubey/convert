import { describe, expect, it } from 'vitest';
import { buildDiagnostics, scrub } from '../src/main/services/diagnostics';
import { defaultSettings } from '../src/main/settings/schema';
import { runSelfTest } from '../src/main/services/selftest';

describe('diagnostics', () => {
  it('hides the user name and home folder wherever they appear', () => {
    expect(scrub('open C:\\Users\\Kabir\\Pictures\\a.png failed', 'C:\\Users\\Kabir')).toBe(
      'open ~\\Pictures\\a.png failed',
    );
    expect(scrub('E:\\Users\\Someone Else\\x', '/home/none')).toContain('<user>');
    expect(scrub('/home/ada/docs/x.pdf', '/home/ada')).toBe('~/docs/x.pdf');
  });

  it('reports versions, engines, options and the log tail, without watch folder names', () => {
    const s = defaultSettings();
    s.watch.rules = [{ id: 'a', folder: 'C:\\Secret\\Clients', target: 'pdf', enabled: true }];
    const text = buildDiagnostics({
      version: '1.3.0',
      electron: '45',
      chrome: '140',
      node: '24',
      packaged: true,
      engines: [
        { id: 'ffmpeg', label: 'Audio and video', ready: true, version: '7.0', optional: false },
        { id: '7zip', label: 'Archives', ready: false, version: null, optional: false },
        { id: 'office', label: 'LibreOffice', ready: false, version: null, optional: true },
      ],
      settings: s,
      updateState: 'current',
      logTail: 'ERROR [jobs] job failed',
    });
    expect(text).toContain('Convert 1.3.0 (installed)');
    expect(text).toContain('ok      Audio and video 7.0');
    expect(text).toContain('MISSING Archives');
    expect(text).toContain('absent  LibreOffice');
    expect(text).toContain('watch folders: 1');
    expect(text).not.toContain('Secret');
    expect(text).toContain('convert=shift+KeyC');
    expect(text).toContain('  ERROR [jobs] job failed');
  });
});

describe('self-test', () => {
  it('runs every check even when some fail, and reports each with its time', async () => {
    const results = await runSelfTest({
      hooksStarted: false,
      openPdf: async () => {
        throw new Error('no reader here');
      },
    });
    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(results.map((r) => r.id)).toEqual([
      'image',
      'av',
      'archive',
      'meta',
      'ocr',
      'pdf',
      'print',
      'hooks',
    ]);
    expect(byId.image?.ok).toBe(true);
    expect(byId.av?.ok).toBe(true);
    expect(byId.archive?.ok).toBe(true);
    expect(byId.pdf).toMatchObject({ ok: false, detail: 'no reader here' });
    expect(byId.print?.ok).toBe(false); // no page printer outside the app
    expect(byId.hooks).toMatchObject({ ok: false });
    for (const r of results) expect(r.ms).toBeGreaterThanOrEqual(0);
  }, 120_000);
});
