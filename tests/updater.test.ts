import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  isNewer,
  parseVersion,
  pickUpdate,
  Updater,
  type UpdateState,
  type UpdaterDeps,
} from '../src/main/services/updater';
import { updateText } from '../src/renderer/settings/pages/About';

const root = mkdtempSync(join(tmpdir(), 'convert-upd-'));
afterAll(() => {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // Windows may still hold a file.
  }
});

const BYTES = Buffer.from('pretend installer');
const SHA = createHash('sha256').update(BYTES).digest('hex');
const release = (over: Record<string, unknown> = {}, asset: Record<string, unknown> = {}) => ({
  tag_name: 'v1.4.0',
  draft: false,
  prerelease: false,
  assets: [
    {
      name: 'Convert-Setup-1.4.0.exe',
      browser_download_url:
        'https://github.com/signingoff-dubey/convert/releases/download/v1.4.0/Convert-Setup-1.4.0.exe',
      digest: `sha256:${SHA}`,
      size: BYTES.length,
      ...asset,
    },
  ],
  ...over,
});

describe('which release is an update', () => {
  it('compares versions numerically', () => {
    expect(parseVersion('v1.2.10')).toEqual([1, 2, 10]);
    expect(parseVersion('1.2')).toBeNull();
    expect(isNewer('1.2.0', 'v1.10.0')).toBe(true);
    expect(isNewer('1.2.0', '1.2.0')).toBe(false);
    expect(isNewer('1.3.0', '1.2.9')).toBe(false);
    expect(isNewer('1.2.0', 'garbage')).toBe(false);
  });

  it('accepts only a published, newer release with one properly named, checksummed installer from this repository', () => {
    expect(pickUpdate(release(), '1.3.0')).toMatchObject({ version: '1.4.0', sha256: SHA });
    expect(pickUpdate(release(), '1.4.0')).toBeNull(); // not newer
    expect(pickUpdate(release({ draft: true }), '1.3.0')).toBeNull();
    expect(pickUpdate(release({ prerelease: true }), '1.3.0')).toBeNull();
    expect(pickUpdate(release({}, { digest: undefined }), '1.3.0')).toBeNull(); // no checksum, no install
    expect(pickUpdate(release({}, { digest: 'sha1:abc' }), '1.3.0')).toBeNull();
    expect(pickUpdate(release({}, { name: 'Convert-Setup-1.4.0.msi' }), '1.3.0')).toBeNull();
    expect(
      pickUpdate(
        release({}, { browser_download_url: 'https://evil.example/Convert-Setup-1.4.0.exe' }),
        '1.3.0',
      ),
    ).toBeNull();
    expect(
      pickUpdate(
        release(
          {},
          {
            browser_download_url:
              'https://github.com/other/repo/releases/download/v1.4.0/Convert-Setup-1.4.0.exe',
          },
        ),
        '1.3.0',
      ),
    ).toBeNull();
    // The file's version must be the release's own version.
    expect(pickUpdate(release({ tag_name: 'v1.5.0' }), '1.3.0')).toBeNull();
    expect(pickUpdate(null, '1.3.0')).toBeNull();
    expect(pickUpdate({ tag_name: 'v9.0.0', assets: [] }, '1.3.0')).toBeNull();
  });
});

function make(over: Partial<UpdaterDeps> = {}, dir = mkdtempSync(join(root, 'd-'))) {
  const states: UpdateState[] = [];
  const installed: string[] = [];
  const deps: UpdaterDeps = {
    current: '1.3.0',
    dir,
    available: () => ({ ok: true }),
    autoInstall: () => true,
    fetchRelease: async () => release(),
    download: async (_url, dest, onProgress) => {
      onProgress(0.5);
      writeFileSync(dest, BYTES);
      onProgress(1);
    },
    isIdle: () => true,
    install: (file) => void installed.push(file),
    onState: (s) => void states.push(s),
    ...over,
  };
  return { updater: new Updater(deps), states, installed, dir };
}

describe('the updater', () => {
  it('downloads, verifies and installs a newer release when idle, with no prompt', async () => {
    const { updater, states, installed, dir } = make();
    await updater.check(false);
    expect(states.map((s) => s.state)).toEqual([
      'checking',
      'downloading',
      'downloading',
      'downloading',
      'ready',
    ]);
    expect(installed).toEqual([join(dir, 'Convert-Setup-1.4.0.exe')]);
    expect(readFileSync(installed[0] as string)).toEqual(BYTES);
    expect(readdirSync(dir)).toEqual(['Convert-Setup-1.4.0.exe']); // no .part file left
  });

  it('rejects a download whose checksum does not match, and installs nothing', async () => {
    const { updater, installed, dir } = make({
      download: async (_u, dest) => writeFileSync(dest, 'tampered'),
    });
    await updater.check(true);
    expect(updater.status().state).toBe('error');
    expect(installed).toEqual([]);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('waits while Convert is busy, then installs once, and installs nothing twice', async () => {
    vi.useFakeTimers();
    try {
      let idle = false;
      const { updater, installed } = make({ isIdle: () => idle });
      await updater.check(false);
      expect(installed).toEqual([]);
      idle = true;
      await vi.advanceTimersByTimeAsync(31_000);
      expect(installed).toHaveLength(1);
      updater.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does nothing when there is no newer release, and stays quiet when offline', async () => {
    const same = make({
      fetchRelease: async () =>
        release({ tag_name: 'v1.3.0' }, { name: 'Convert-Setup-1.3.0.exe' }),
    });
    await same.updater.check(false);
    expect(same.updater.status().state).toBe('current');
    expect(same.installed).toEqual([]);
    const offline = make({ fetchRelease: async () => Promise.reject(new Error('ENOTFOUND')) });
    await offline.updater.check(false);
    expect(offline.updater.status().state).toBe('idle'); // not an error the user needs to see
    await offline.updater.check(true);
    expect(offline.updater.status()).toMatchObject({ state: 'error' });
  });

  it('respects the switch: no automatic check, but Check now downloads and waits for Restart', async () => {
    const { updater, states, installed } = make({ autoInstall: () => false });
    await updater.check(false);
    expect(states).toEqual([]);
    await updater.check(true);
    expect(updater.status()).toMatchObject({ state: 'ready', version: '1.4.0' });
    expect(installed).toEqual([]);
    updater.installNow();
    expect(installed).toHaveLength(1);
  });

  it('is off in development and reuses an installer that is already downloaded and still matches', async () => {
    const off = make({ available: () => ({ ok: false, reason: 'dev' }) });
    await off.updater.check(true);
    expect(off.updater.status()).toEqual({ state: 'off', reason: 'dev' });
    const download = vi.fn(async (_u: string, dest: string) => writeFileSync(dest, BYTES));
    const first = make({ download, isIdle: () => false });
    await first.updater.check(false);
    const again = make({ download, isIdle: () => false }, first.dir);
    await again.updater.check(false);
    expect(download).toHaveBeenCalledTimes(1);
    expect(existsSync(join(first.dir, 'Convert-Setup-1.4.0.exe'))).toBe(true);
    first.updater.stop();
    again.updater.stop();
  });

  it('words every state in plain language', () => {
    expect(updateText({ state: 'current', checkedAt: 0 })).toBe('You have the latest version.');
    expect(updateText({ state: 'downloading', version: '1.4.0', percent: 40 })).toContain('40%');
    expect(updateText({ state: 'ready', version: '1.4.0' })).toContain(
      'installs when Convert is not busy',
    );
  });
});
