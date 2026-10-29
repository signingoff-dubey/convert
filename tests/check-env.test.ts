import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';

const { inspect, EXIT } = createRequire(import.meta.url)('../scripts/check-env.cjs') as {
  inspect: (
    root: string,
    opts?: Record<string, unknown>,
  ) => { items: { id: string; status: string; detail: string }[]; code: number };
  EXIT: { PACKAGES: number; DOWNLOADS: number; BUILD: number; TOOLS: number; NATIVE: number };
};

const roots: string[] = [];
function fakeProject(
  opts: {
    packages?: string[];
    electron?: boolean;
    ffmpeg?: boolean;
    build?: boolean;
    stale?: boolean;
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'convert-env-'));
  roots.push(root);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      dependencies: { alpha: '1', '@scope/beta': '1' },
      devDependencies: { gamma: '1' },
    }),
  );
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'a.ts'), 'x');
  for (const name of opts.packages ?? []) {
    mkdirSync(join(root, 'node_modules', name), { recursive: true });
    writeFileSync(join(root, 'node_modules', name, 'package.json'), '{}');
  }
  if (opts.electron) {
    mkdirSync(join(root, 'node_modules', 'electron', 'dist'), { recursive: true });
    writeFileSync(join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), 'x');
  }
  if (opts.ffmpeg) {
    mkdirSync(join(root, 'node_modules', 'ffmpeg-static'), { recursive: true });
    writeFileSync(join(root, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'), 'x');
  }
  if (opts.build) {
    for (const f of ['out/main/index.js', 'out/preload/index.js', 'out/renderer/settings.html']) {
      mkdirSync(join(root, f, '..'), { recursive: true });
      writeFileSync(join(root, f), 'x');
    }
    const later = new Date(Date.now() + (opts.stale ? -60_000 : 60_000));
    for (const f of ['out/main/index.js', 'out/preload/index.js', 'out/renderer/settings.html'])
      utimesSync(join(root, f), later, later);
  }
  return root;
}
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

const base = {
  platform: 'win32',
  arch: 'x64',
  nodeVersion: '22.1.0',
  npmVersion: '10.0.0',
  tryLoad: false,
};
const status = (r: ReturnType<typeof inspect>, id: string) =>
  r.items.find((i) => i.id === id)?.status;

describe('check-env', () => {
  it('reports a fresh checkout as needing packages and a build, and does not ask for downloads yet', () => {
    const r = inspect(fakeProject(), base);
    expect(r.code & EXIT.PACKAGES).toBe(EXIT.PACKAGES);
    expect(r.code & EXIT.BUILD).toBe(EXIT.BUILD);
    expect(r.code & EXIT.DOWNLOADS).toBe(0);
    expect(status(r, 'ffmpeg')).toBe('pending');
  });
  it('names missing packages, including scoped ones', () => {
    const r = inspect(fakeProject({ packages: ['alpha'] }), base);
    expect(r.items.find((i) => i.id === 'packages')?.detail).toMatch(/2 missing.*@scope\/beta/);
  });
  it('asks only for the downloads when packages are present but ffmpeg is not', () => {
    const r = inspect(
      fakeProject({ packages: ['alpha', '@scope/beta', 'gamma'], electron: true, build: true }),
      base,
    );
    expect(status(r, 'electron')).toBe('ok');
    expect(status(r, 'ffmpeg')).toBe('missing');
    expect(r.code).toBe(EXIT.DOWNLOADS | EXIT.PACKAGES); // 7-Zip is not in the fake package, so packages are flagged too
  });
  it('is clean when everything is there and the build is newer than the source', () => {
    const root = fakeProject({
      packages: ['alpha', '@scope/beta', 'gamma', '7zip-bin'],
      electron: true,
      ffmpeg: true,
      build: true,
    });
    mkdirSync(join(root, 'node_modules', '7zip-bin', 'win', 'x64'), { recursive: true });
    writeFileSync(join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'), 'x');
    const r = inspect(root, base);
    expect(r.code).toBe(0);
    expect(status(r, 'build')).toBe('ok');
  });
  it('flags an out-of-date build', () => {
    const root = fakeProject({
      packages: ['alpha', '@scope/beta', 'gamma'],
      electron: true,
      ffmpeg: true,
      build: true,
      stale: true,
    });
    expect(status(inspect(root, base), 'build')).toBe('outdated');
  });
  it('flags a Node.js that is too old or an npm that is missing', () => {
    const r = inspect(fakeProject(), { ...base, nodeVersion: '18.19.0', npmVersion: null });
    expect(r.code & EXIT.TOOLS).toBe(EXIT.TOOLS);
    expect(status(r, 'node')).toBe('missing');
    expect(status(r, 'npm')).toBe('missing');
  });
  it('only tries to load the native modules on Windows', () => {
    const root = join(__dirname, '..');
    expect(
      status(inspect(root, { ...base, platform: 'linux', arch: 'x64', tryLoad: true }), 'native'),
    ).toBe('pending');
  });
  it('uses the platform binary names', () => {
    const root = fakeProject({ packages: ['alpha', '@scope/beta', 'gamma'] });
    mkdirSync(join(root, 'node_modules', 'ffmpeg-static'), { recursive: true });
    writeFileSync(join(root, 'node_modules', 'ffmpeg-static', 'ffmpeg'), 'x');
    expect(status(inspect(root, { ...base, platform: 'linux' }), 'ffmpeg')).toBe('ok');
    expect(status(inspect(root, base), 'ffmpeg')).toBe('missing');
  });
  it('treats the real project as complete once it is installed and built', () => {
    const r = inspect(join(__dirname, '..'), {
      ...base,
      platform: process.platform,
      arch: process.arch,
      tryLoad: true,
    });
    expect(status(r, 'packages')).toBe('ok');
    expect(status(r, 'electron')).toBe('ok');
    expect(status(r, 'ffmpeg')).toBe('ok');
  });
});
