import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { logger } from './log';

const log = logger('updater');

/** Where releases come from. Only this repository's own download addresses are ever followed. */
export const REPO = 'signingoff-dubey/convert';
const ASSET = /^Convert-Setup-(\d+\.\d+\.\d+)\.exe$/;
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;
const FIRST_CHECK_MS = 60_000;
const EVERY_MS = 6 * 3_600_000;
const IDLE_POLL_MS = 30_000;

export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isNewer(current: string, latest: string): boolean {
  const a = parseVersion(current);
  const b = parseVersion(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++)
    if ((b[i] as number) !== (a[i] as number)) return (b[i] as number) > (a[i] as number);
  return false;
}

export interface UpdateOffer {
  version: string;
  name: string;
  url: string;
  sha256: string;
  size: number;
}

/**
 * Picks the installer from a GitHub release, or null. A release is only trusted when it is published (not a draft
 * or a pre-release), newer than this build, holds exactly one correctly named installer served from this
 * repository, and states that file's SHA-256, which is checked after the download.
 */
export function pickUpdate(release: unknown, current: string): UpdateOffer | null {
  const r = release as {
    tag_name?: unknown;
    draft?: unknown;
    prerelease?: unknown;
    assets?: { name?: unknown; browser_download_url?: unknown; digest?: unknown; size?: unknown }[];
  } | null;
  if (!r || r.draft === true || r.prerelease === true || typeof r.tag_name !== 'string')
    return null;
  if (!isNewer(current, r.tag_name)) return null;
  const installers = (r.assets ?? []).filter(
    (a) => typeof a.name === 'string' && ASSET.test(a.name),
  );
  if (installers.length !== 1) return null;
  const a = installers[0] as NonNullable<typeof installers>[number];
  const name = a.name as string;
  const version = (ASSET.exec(name) as RegExpExecArray)[1] as string;
  const digest =
    typeof a.digest === 'string' ? /^sha256:([0-9a-f]{64})$/i.exec(a.digest)?.[1] : undefined;
  const url = typeof a.browser_download_url === 'string' ? a.browser_download_url : '';
  if (version !== r.tag_name.replace(/^v/, '')) return null; // the file must be the release's own version
  if (!digest || !url.startsWith(DOWNLOAD_PREFIX) || !url.endsWith(`/${name}`)) return null;
  return {
    version,
    name,
    url,
    sha256: digest.toLowerCase(),
    size: typeof a.size === 'number' ? a.size : 0,
  };
}

export async function sha256Of(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export type UpdateState =
  | { state: 'off'; reason: string }
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'current'; checkedAt: number }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string; checkedAt: number };

export interface UpdaterDeps {
  /** This build's version. */
  current: string;
  /** Where downloads are kept. */
  dir: string;
  /** False in development, off Windows, or when the user turned automatic updates off. */
  available(): { ok: true } | { ok: false; reason: string };
  autoInstall(): boolean;
  fetchRelease(): Promise<unknown>;
  download(url: string, dest: string, onProgress: (fraction: number) => void): Promise<void>;
  /** True when nothing is running that an update would interrupt. */
  isIdle(): boolean;
  /** Runs the installer silently and quits this app. */
  install(file: string): void;
  onState(state: UpdateState): void;
  now?(): number;
}

/** Looks for a newer release, downloads and verifies it quietly, and installs it when Convert is idle. */
export class Updater {
  private state: UpdateState = { state: 'idle' };
  private timers = new Set<NodeJS.Timeout>();
  private ready: { version: string; file: string } | null = null;
  private busy = false;

  constructor(private readonly deps: UpdaterDeps) {}

  status(): UpdateState {
    // Without a check yet, say whether updates can work here at all.
    const avail = this.deps.available();
    return avail.ok ? this.state : { state: 'off', reason: avail.reason };
  }

  start(): void {
    const first = setTimeout(() => void this.check(false), FIRST_CHECK_MS);
    const every = setInterval(() => void this.check(false), EVERY_MS);
    first.unref?.();
    every.unref?.();
    this.timers.add(first).add(every);
  }

  stop(): void {
    for (const t of this.timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this.timers.clear();
  }

  private set(next: UpdateState): void {
    this.state = next;
    this.deps.onState(next);
  }

  /** `manual` is the Check now button: it works even when automatic updates are off, and it reports errors. */
  async check(manual: boolean): Promise<void> {
    const avail = this.deps.available();
    if (!avail.ok) return this.set({ state: 'off', reason: avail.reason });
    if (this.busy) return;
    if (!manual && !this.deps.autoInstall()) return;
    if (this.ready) return this.maybeInstall();
    this.busy = true;
    const now = (this.deps.now ?? Date.now)();
    try {
      this.set({ state: 'checking' });
      const offer = pickUpdate(await this.deps.fetchRelease(), this.deps.current);
      if (!offer) return this.set({ state: 'current', checkedAt: now });
      await this.fetchAndVerify(offer);
    } catch (error) {
      // Offline or GitHub unreachable: nothing to tell the user unless they asked.
      log.info(`update check failed: ${error instanceof Error ? error.message : String(error)}`);
      this.set(
        manual
          ? {
              state: 'error',
              message: 'Could not reach GitHub. Check the internet connection.',
              checkedAt: now,
            }
          : { state: 'idle' },
      );
    } finally {
      this.busy = false;
    }
    if (this.ready) this.maybeInstall();
  }

  private async fetchAndVerify(offer: UpdateOffer): Promise<void> {
    await mkdir(this.deps.dir, { recursive: true });
    const dest = path.join(this.deps.dir, offer.name);
    // An installer downloaded earlier is reused only if it still matches the published checksum.
    if (existsSync(dest) && (await sha256Of(dest)) === offer.sha256) {
      this.ready = { version: offer.version, file: dest };
      return this.set({ state: 'ready', version: offer.version });
    }
    for (const old of await readdir(this.deps.dir))
      await rm(path.join(this.deps.dir, old), { force: true });
    const part = `${dest}.part`;
    this.set({ state: 'downloading', version: offer.version, percent: 0 });
    let last = 0;
    await this.deps.download(offer.url, part, (f) => {
      const percent = Math.round(f * 100);
      if (percent !== last) {
        last = percent;
        this.set({ state: 'downloading', version: offer.version, percent });
      }
    });
    if ((await sha256Of(part)) !== offer.sha256) {
      await rm(part, { force: true });
      throw new Error('the download does not match its published checksum');
    }
    await rename(part, dest);
    this.ready = { version: offer.version, file: dest };
    this.set({ state: 'ready', version: offer.version });
  }

  /** Installs now if automatic updates are on, otherwise leaves the verified installer for the Restart button. */
  private maybeInstall(): void {
    if (!this.ready || !this.deps.autoInstall()) return;
    const tryNow = (): void => {
      if (!this.ready) return;
      if (this.deps.isIdle()) {
        log.info(`installing ${this.ready.version}`);
        this.deps.install(this.ready.file);
        return;
      }
      const t = setTimeout(tryNow, IDLE_POLL_MS);
      t.unref?.();
      this.timers.add(t);
    };
    tryNow();
  }

  /** The Restart and update button. */
  installNow(): void {
    if (this.ready) this.deps.install(this.ready.file);
  }
}
