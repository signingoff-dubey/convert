import { copyFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { unpacked } from './binaries';
import { nodeRequire } from './req';

/**
 * Inter (SIL Open Font License) ships with the app. Any font a document asks for that this computer
 * does not have is replaced by Inter, so a conversion never fails or comes out in an arbitrary font.
 */
const GENERIC = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
  'inherit',
  'initial',
  'unset',
  'revert',
  'inter',
]);

function interDir(): string {
  const manifest = nodeRequire.resolve('@fontsource-variable/inter/package.json');
  return unpacked(dirname(manifest));
}

interface Face {
  file: string;
  range: string;
}

async function faces(): Promise<Face[]> {
  const css = await readFile(join(interDir(), 'index.css'), 'utf8');
  const out: Face[] = [];
  for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
    if (file && range) out.push({ file, range });
  }
  return out;
}

/** Font family names used in an HTML document's styles, minus generic ones such as sans-serif. */
export function familiesIn(html: string): string[] {
  const names = new Set<string>();
  for (const m of html.matchAll(/font-family\s*:\s*([^;}<]+)/gi)) {
    for (const part of ((m[1] as string).split('>')[0] as string).split(',')) {
      const name = part
        .replace(/!important/i, '')
        .trim()
        .replace(/^['"\s]+|['"\s]+$/g, '')
        .trim();
      if (name !== '' && !GENERIC.has(name.toLowerCase())) names.add(name);
    }
  }
  for (const m of html.matchAll(/<font[^>]*\bface\s*=\s*["']([^"']+)["']/gi))
    names.add((m[1] as string).trim());
  return [...names];
}

/**
 * Copies Inter next to the page and returns CSS that defines every family the page uses as "the installed
 * font if there is one, otherwise Inter". Inter itself is defined too, as the page's default.
 */
export async function interFallbackCss(html: string, dir: string): Promise<string> {
  const list = await faces();
  for (const f of list) await copyFile(join(interDir(), 'files', f.file), join(dir, f.file));
  const rule = (family: string, local: boolean): string =>
    list
      .map(
        (f) =>
          `@font-face{font-family:"${family.replace(/"/g, '')}";font-weight:100 900;font-style:normal;` +
          `src:${local ? `local("${family.replace(/"/g, '')}"),` : ''}url("${f.file}") format("woff2");unicode-range:${f.range}}`,
      )
      .join('\n');
  return [rule('Inter', false), ...familiesIn(html).map((name) => rule(name, true))].join('\n');
}

/** Puts the fallback CSS at the top of an HTML document. */
export function injectCss(html: string, css: string): string {
  const style = `<style>${css}</style>`;
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (h) => `${h}${style}`)
    : `${style}${html}`;
}
