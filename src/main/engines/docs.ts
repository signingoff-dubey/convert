import { nodeRequire } from './req';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { extensionOf } from '../../shared/formats';
import { JobError, type Engine, type Operation } from '../jobs/types';
import { dynamicImport } from './esm';
import { htmlToPdf, htmlToPdfAvailable } from './html-pdf';
import { buildEpub, readEpub, splitChapters } from './epub';
import { rtfToText } from './rtf';
import { officeConvert } from './office';

const DOC_EXTS = new Set(['docx', 'md', 'txt', 'html', 'rtf', 'epub']);
const TARGETS = new Set(['pdf', 'txt', 'md', 'html', 'docx', 'epub']);

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
<style>body{font-family:system-ui,'Segoe UI',sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;line-height:1.6}pre{background:#f4f4f6;padding:.75rem;overflow:auto;white-space:pre-wrap;word-break:break-word}code{background:#f4f4f6;padding:.1em .3em;border-radius:3px}pre code{background:none;padding:0}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.3rem .6rem}img{max-width:100%}blockquote{border-left:3px solid #ccc;margin-left:0;padding-left:1rem;color:#555}@media print{body{max-width:none;margin:0}h1,h2,h3{break-after:avoid}pre,table,img{break-inside:avoid}}</style>
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

type Ctx = Parameters<Engine['run']>[2];

const paragraphs = (text: string): string =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');

/** Body HTML for any document input. Everything else is built from this, so each format pair is one small step. */
async function sourceHtml(
  input: string,
  ext: string,
  ctx: Ctx,
): Promise<{ title: string; html: string }> {
  const fallbackTitle = basename(input).replace(/\.[^.]+$/, '');
  if (ext === 'docx') return { title: fallbackTitle, html: await docxToHtml(input) };
  if (ext === 'epub') return readEpub(input);
  if (ext === 'rtf') {
    if (ctx.officePath) {
      const produced = await officeConvert(ctx.officePath, input, 'html', ctx.tempDir, ctx.signal);
      return { title: fallbackTitle, html: await readFile(produced, 'utf8') };
    }
    return { title: fallbackTitle, html: paragraphs(rtfToText(await readFile(input, 'latin1'))) };
  }
  const text = (await readFile(input, 'utf8')).replace(/^﻿/, '');
  if (ext === 'html') return { title: fallbackTitle, html: text };
  if (ext === 'md') return { title: fallbackTitle, html: (await marked()).parse(text) };
  return { title: fallbackTitle, html: paragraphs(text) };
}

async function toMarkdown(input: string, ext: string, ctx: Ctx): Promise<string> {
  if (ext === 'md' || ext === 'txt') return (await readFile(input, 'utf8')).replace(/^﻿/, '');
  return htmlToMd((await sourceHtml(input, ext, ctx)).html);
}

async function toPdf(input: string, ext: string, ctx: Ctx): Promise<void> {
  // Word and RTF files keep their layout best through LibreOffice when it is installed; everything else
  // (and those two, without it) is typeset from HTML by the built-in renderer, so no extra install is needed.
  const useOffice = ctx.officePath !== null && (ext === 'docx' || ext === 'rtf');
  if (!useOffice && htmlToPdfAvailable()) {
    const { title, html } = await sourceHtml(input, ext, ctx);
    const work = join(ctx.tempDir, 'src');
    await mkdir(work, { recursive: true });
    const page_ = join(work, 'page.html');
    await writeFile(page_, ext === 'html' ? html : page(title, html), 'utf8');
    await htmlToPdf(page_, ctx.tempPath, ctx.signal);
    return;
  }
  if (!ctx.officePath) throw new JobError('E_ENGINE_MISSING', 'LibreOffice');
  let source = input;
  if (ext === 'md' || ext === 'epub' || ext === 'txt') {
    // LibreOffice cannot read these directly, so hand it an HTML rendition.
    const { title, html } = await sourceHtml(input, ext, ctx);
    const work = join(ctx.tempDir, 'src');
    await mkdir(work, { recursive: true });
    source = join(work, `${basename(input).replace(/\.[^.]+$/, '')}.html`);
    await writeFile(source, page(title, html), 'utf8');
  }
  const produced = await officeConvert(ctx.officePath, source, 'pdf', ctx.tempDir, ctx.signal);
  await copyFile(produced, ctx.tempPath);
}

export function docsCanHandle(op: Operation, input: string): boolean {
  const ext = extensionOf(input);
  if (op.kind === 'tool') return op.id === 'merge' && (ext === 'txt' || ext === 'md');
  return op.kind === 'convert' && DOC_EXTS.has(ext) && TARGETS.has(op.id) && ext !== op.id;
}

export const docsEngine: Engine = {
  id: 'docs',
  canHandle: docsCanHandle,
  async run(op, input, ctx) {
    const ext = extensionOf(input);
    if (op.kind === 'tool') {
      // Text and Markdown files are joined in the order given, each separated by a blank line.
      const texts: string[] = [];
      for (const file of ctx.allInputs.length > 0 ? ctx.allInputs : [input]) {
        texts.push((await readFile(file, 'utf8')).replace(/^﻿/, '').replace(/\s+$/, ''));
      }
      return writeFile(ctx.tempPath, texts.join('\n\n') + '\n', 'utf8');
    }
    switch (op.id) {
      case 'pdf':
        return toPdf(input, ext, ctx);
      case 'txt': {
        if (ext === 'docx') {
          const mammoth = nodeRequire('mammoth') as typeof import('mammoth');
          const raw = await mammoth.extractRawText({ path: input }).catch((e: unknown) => {
            throw new JobError('E_CORRUPT_INPUT', e instanceof Error ? e.message : 'docx');
          });
          return writeFile(ctx.tempPath, raw.value, 'utf8');
        }
        if (ext === 'md')
          return writeFile(ctx.tempPath, mdToText(await readFile(input, 'utf8')), 'utf8');
        if (ext === 'rtf' && !ctx.officePath) {
          return writeFile(ctx.tempPath, rtfToText(await readFile(input, 'latin1')), 'utf8');
        }
        return writeFile(
          ctx.tempPath,
          htmlToText((await sourceHtml(input, ext, ctx)).html),
          'utf8',
        );
      }
      case 'md':
        return writeFile(ctx.tempPath, await toMarkdown(input, ext, ctx), 'utf8');
      case 'html': {
        const { title, html } = await sourceHtml(input, ext, ctx);
        return writeFile(ctx.tempPath, ext === 'html' ? html : page(title, html), 'utf8');
      }
      case 'docx':
        return mdToDocx(await toMarkdown(input, ext, ctx), ctx.tempPath);
      case 'epub': {
        const { title, html } = await sourceHtml(input, ext, ctx);
        return writeFile(
          ctx.tempPath,
          await buildEpub({ title, chapters: splitChapters(html, title) }),
        );
      }
      default:
        throw new JobError('E_UNSUPPORTED', `${ext} to ${op.id}`);
    }
  },
};
