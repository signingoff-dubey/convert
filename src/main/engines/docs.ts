import { nodeRequire } from './req';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { extensionOf } from '../../shared/formats';
import { JobError, type Engine, type Operation } from '../jobs/types';
import { execFileSafe } from './exec';
import { dynamicImport } from './esm';

const DOC_EXTS = new Set(['docx', 'md', 'txt', 'html']);
const TARGETS = new Set(['pdf', 'txt', 'md', 'html', 'docx']);

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .concat('\n');
}

export function mdToText(md: string): string {
  return (
    md
      .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, ''))
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__|\*|_|`)/g, '')
      .replace(/^>\s?/gm, '')
      .trim() + '\n'
  );
}

function page(title: string, body: string): string {
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;line-height:1.6}pre{background:#f4f4f6;padding:.75rem;overflow:auto}</style>
</head><body>\n${body}\n</body></html>\n`;
}

type Marked = { parse(src: string): string; lexer(src: string): MdToken[] };
interface MdToken {
  type: string;
  raw?: string;
  text?: string;
  depth?: number;
  ordered?: boolean;
  tokens?: MdToken[];
  items?: MdToken[];
  header?: { tokens: MdToken[] }[];
  rows?: { tokens: MdToken[] }[][];
}

async function marked(): Promise<Marked> {
  const mod = await dynamicImport<{ marked: Marked }>('marked');
  return mod.marked;
}

async function docxToHtml(input: string): Promise<string> {
  const mammoth = nodeRequire('mammoth') as typeof import('mammoth');
  try {
    return (await mammoth.convertToHtml({ path: input })).value;
  } catch (error) {
    throw new JobError('E_CORRUPT_INPUT', error instanceof Error ? error.message : 'docx');
  }
}

async function htmlToMd(html: string): Promise<string> {
  const Turndown = nodeRequire('turndown') as new (o: {
    headingStyle: string;
    codeBlockStyle: string;
  }) => {
    turndown(html: string): string;
  };
  return new Turndown({ headingStyle: 'atx', codeBlockStyle: 'fenced' }).turndown(html) + '\n';
}

async function mdToDocx(md: string, outPath: string): Promise<void> {
  const docx = await import('docx');
  const m = await marked();
  const inline = (
    tokens: MdToken[] | undefined,
    style: { bold?: boolean; italics?: boolean } = {},
  ): InstanceType<typeof docx.TextRun>[] =>
    (tokens ?? []).flatMap((t): InstanceType<typeof docx.TextRun>[] => {
      switch (t.type) {
        case 'strong':
          return inline(t.tokens, { ...style, bold: true });
        case 'em':
          return inline(t.tokens, { ...style, italics: true });
        case 'codespan':
          return [new docx.TextRun({ text: t.text ?? '', font: 'Consolas', ...style })];
        case 'link':
          return inline(t.tokens, style);
        case 'br':
          return [new docx.TextRun({ break: 1 })];
        default:
          return t.tokens
            ? inline(t.tokens, style)
            : [new docx.TextRun({ text: t.text ?? t.raw ?? '', ...style })];
      }
    });
  const HEADINGS = [
    docx.HeadingLevel.HEADING_1,
    docx.HeadingLevel.HEADING_2,
    docx.HeadingLevel.HEADING_3,
    docx.HeadingLevel.HEADING_4,
    docx.HeadingLevel.HEADING_5,
    docx.HeadingLevel.HEADING_6,
  ];
  const children: (InstanceType<typeof docx.Paragraph> | InstanceType<typeof docx.Table>)[] = [];
  const block = (t: MdToken, level = 0): void => {
    switch (t.type) {
      case 'heading':
        children.push(
          new docx.Paragraph({
            heading: HEADINGS[Math.min((t.depth ?? 1) - 1, 5)],
            children: inline(t.tokens),
          }),
        );
        break;
      case 'paragraph':
        children.push(new docx.Paragraph({ children: inline(t.tokens), spacing: { after: 120 } }));
        break;
      case 'list':
        (t.items ?? []).forEach((item, i) => {
          const parts = item.tokens ?? [];
          const text = parts.find((p) => p.type === 'text' || p.type === 'paragraph');
          children.push(
            new docx.Paragraph({
              children: [
                ...(t.ordered ? [new docx.TextRun({ text: `${i + 1}. ` })] : []),
                ...inline(text?.tokens ?? [{ type: 'text', text: item.text ?? '' }]),
              ],
              bullet: t.ordered ? undefined : { level },
              indent: t.ordered ? { left: 360 * (level + 1) } : undefined,
            }),
          );
          parts.filter((p) => p.type === 'list').forEach((nested) => block(nested, level + 1));
        });
        break;
      case 'code':
        for (const line of (t.text ?? '').split('\n')) {
          children.push(
            new docx.Paragraph({ children: [new docx.TextRun({ text: line, font: 'Consolas' })] }),
          );
        }
        break;
      case 'blockquote':
        (t.tokens ?? []).forEach((b) => {
          children.push(
            new docx.Paragraph({
              children: inline(b.tokens, { italics: true }),
              indent: { left: 720 },
            }),
          );
        });
        break;
      case 'hr':
        children.push(
          new docx.Paragraph({
            border: { bottom: { style: docx.BorderStyle.SINGLE, size: 6, color: '999999' } },
          }),
        );
        break;
      case 'table': {
        const cell = (tokens: MdToken[] | undefined) =>
          new docx.TableCell({ children: [new docx.Paragraph({ children: inline(tokens) })] });
        children.push(
          new docx.Table({
            rows: [
              new docx.TableRow({ children: (t.header ?? []).map((h) => cell(h.tokens)) }),
              ...(t.rows ?? []).map(
                (r) => new docx.TableRow({ children: r.map((c) => cell(c.tokens)) }),
              ),
            ],
          }),
        );
        break;
      }
      default:
        break;
    }
  };
  m.lexer(md).forEach((t) => block(t));
  if (children.length === 0) children.push(new docx.Paragraph({}));
  const doc = new docx.Document({ sections: [{ children }] });
  await writeFile(outPath, await docx.Packer.toBuffer(doc));
}

/** Everything funnels through Markdown or HTML so each pair needs one small step, not N x N code. */
async function toMarkdown(input: string, ext: string): Promise<string> {
  const text = ext === 'docx' ? '' : await readFile(input, 'utf8');
  if (ext === 'docx') return htmlToMd(await docxToHtml(input));
  if (ext === 'html') return htmlToMd(text);
  return text.replace(/^﻿/, '');
}

async function toHtml(input: string, ext: string): Promise<string> {
  if (ext === 'docx') return docxToHtml(input);
  const text = await readFile(input, 'utf8');
  if (ext === 'html') return text;
  if (ext === 'md') return (await marked()).parse(text);
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

async function viaOffice(
  input: string,
  ext: string,
  ctx: Parameters<Engine['run']>[2],
): Promise<void> {
  if (!ctx.officePath) throw new JobError('E_ENGINE_MISSING', 'LibreOffice');
  const work = join(ctx.tempDir, 'office');
  await mkdir(work, { recursive: true });
  let source = input;
  if (ext === 'md') {
    source = join(work, `${basename(input, '.md')}.html`);
    await writeFile(source, page(basename(input), await toHtml(input, 'md')), 'utf8');
  }
  const res = await execFileSafe(
    ctx.officePath,
    ['--headless', '--convert-to', 'pdf', '--outdir', work, source],
    { signal: ctx.signal },
  );
  if (res.code !== 0) throw new JobError('E_UNKNOWN', res.stderr.slice(-300));
  const produced = join(work, `${basename(source).replace(/\.[^.]+$/, '')}.pdf`);
  await copyFile(produced, ctx.tempPath);
  await rm(work, { recursive: true, force: true });
}

export function docsCanHandle(op: Operation, input: string): boolean {
  return op.kind === 'convert' && DOC_EXTS.has(extensionOf(input)) && TARGETS.has(op.id);
}

export const docsEngine: Engine = {
  id: 'docs',
  canHandle: docsCanHandle,
  async run(op, input, ctx) {
    const ext = extensionOf(input);
    if (op.id === 'pdf') return viaOffice(input, ext, ctx);
    if (op.id === 'txt') {
      if (ext === 'docx') {
        const mammoth = nodeRequire('mammoth') as typeof import('mammoth');
        const raw = await mammoth.extractRawText({ path: input }).catch((e: unknown) => {
          throw new JobError('E_CORRUPT_INPUT', e instanceof Error ? e.message : 'docx');
        });
        return writeFile(ctx.tempPath, raw.value, 'utf8');
      }
      const text = await readFile(input, 'utf8');
      return writeFile(
        ctx.tempPath,
        ext === 'html' ? htmlToText(text) : ext === 'md' ? mdToText(text) : text,
        'utf8',
      );
    }
    if (op.id === 'md') return writeFile(ctx.tempPath, await toMarkdown(input, ext), 'utf8');
    if (op.id === 'html') {
      return writeFile(
        ctx.tempPath,
        ext === 'html' ? await readFile(input) : page(basename(input), await toHtml(input, ext)),
        'utf8',
      );
    }
    if (op.id === 'docx') return mdToDocx(await toMarkdown(input, ext), ctx.tempPath);
    throw new JobError('E_UNSUPPORTED', `${ext} to ${op.id}`);
  },
};
