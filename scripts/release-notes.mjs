// Prints the CHANGELOG.md section for a tag, for the release notes: node scripts/release-notes.mjs v1.3.0
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function section(markdown, tag) {
  const version = tag.replace(/^v/, '');
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `## ${version}`);
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tag = process.argv[2] ?? '';
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const text = section(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), tag);
  if (!text) {
    console.error(`No section for ${tag} in CHANGELOG.md`);
    process.exit(1);
  }
  console.log(text);
}
