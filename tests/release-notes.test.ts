import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The script is plain JavaScript.
import { section } from '../scripts/release-notes.mjs';

const changelog = readFileSync('CHANGELOG.md', 'utf8');
const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

describe('release notes', () => {
  it('has notes for the version being built, and for every earlier release', () => {
    for (const v of [version, '1.2.0', '1.1.0', '1.0.0'])
      expect((section(changelog, `v${v}`) as string | null)?.length ?? 0, v).toBeGreaterThan(40);
  });
  it('takes one section only, and nothing for an unknown version', () => {
    const one = section(changelog, 'v1.1.0') as string;
    expect(one).toContain('Share (Shift+S)');
    expect(one).not.toContain('Watch folders');
    expect(section(changelog, 'v9.9.9')).toBeNull();
  });
});
