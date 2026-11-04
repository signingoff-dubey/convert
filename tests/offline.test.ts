import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// AGENTS.md: no network calls from the shipped app. Only documentation links are allowed.
// XML namespace identifiers are names, not addresses: nothing ever fetches them.
const ALLOWED = [
  /^http:\/\/www\.w3\.org\/1999\/xhtml$/,
  /^http:\/\/www\.idpf\.org\/2007\/(ops|opf)$/,
  /^http:\/\/purl\.org\/dc\/elements\/1\.1\/$/,
  /^https:\/\/github\.com\/signingoff-dubey\/convert/,
  // The updater, which asks this repository's releases for a newer version. Nothing else is contacted.
  /^https:\/\/api\.github\.com\/repos\/\$\{REPO\}\/releases\/latest$/,
  /^https:\/\/github\.com\/\$\{REPO\}\/releases\/download\/$/,
  /^http:\/\/www\.w3\.org\/2000\/svg$/,
  /^http:\/\/www\.topografix\.com\/GPX\/1\/1$/,
  /^http:\/\/www\.opengis\.net\/kml\/2\.2$/,
  // Share to apps: addresses handed to the user's own browser when they pick a target. The app never fetches them.
  /^https:\/\/(claude\.ai\/new|chatgpt\.com\/|web\.telegram\.org\/|web\.whatsapp\.com\/|discord\.com\/app|app\.slack\.com\/client|mail\.google\.com\/mail\/\?view=cm&fs=1)$/,
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|css|html)$/.test(p) ? [p] : [];
  });
}

describe('offline guarantee', () => {
  it('has no remote URLs in src/ outside the allowlist', () => {
    const offenders: string[] = [];
    for (const file of walk('src')) {
      for (const url of readFileSync(file, 'utf8').match(/https?:\/\/[^\s'"`)>]+/g) ?? []) {
        if (!ALLOWED.some((re) => re.test(url))) offenders.push(`${file}: ${url}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
