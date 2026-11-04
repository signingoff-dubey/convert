import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { extensionOf } from '../../shared/formats';
import { JobError, type Engine } from '../jobs/types';
import { escapeHtml, page } from './docs';
import { injectCss, interFallbackCss } from './fonts';
import { htmlToPdf, htmlToPdfAvailable } from './html-pdf';
import { nodeRequire } from './req';

interface Addr {
  name?: string;
  address?: string;
}
interface Mail {
  from?: Addr;
  to?: Addr[];
  cc?: Addr[];
  subject?: string;
  date?: string;
  text?: string;
  html?: string;
  attachments?: { filename?: string }[];
}

const who = (a?: Addr | Addr[]): string =>
  (Array.isArray(a) ? a : a ? [a] : [])
    .map((x) => (x.name ? `${x.name} <${x.address ?? ''}>` : (x.address ?? '')))
    .join(', ');

/** The header lines shown above a message. */
export function headerLines(m: Mail): [string, string][] {
  const lines: [string, string][] = [
    ['From', who(m.from)],
    ['To', who(m.to)],
    ['Cc', who(m.cc)],
    ['Date', m.date ? new Date(m.date).toLocaleString('en-GB') : ''],
    ['Subject', m.subject ?? ''],
  ];
  return lines.filter(([, v]) => v !== '');
}

async function parse(input: string): Promise<Mail> {
  const PostalMime = nodeRequire('postal-mime') as {
    default?: { parse(b: Buffer): Promise<Mail> };
  } & {
    parse?: (b: Buffer) => Promise<Mail>;
  };
  const parser = PostalMime.default ?? (PostalMime as { parse(b: Buffer): Promise<Mail> });
  try {
    return await parser.parse(await readFile(input));
  } catch (error) {
    throw new JobError('E_CORRUPT_INPUT', error instanceof Error ? error.message : 'email');
  }
}

/** Saved email (EML) to PDF, HTML or plain text. Remote pictures are never fetched; attachments are not converted. */
export const emailEngine: Engine = {
  id: 'email',
  canHandle: (op, input) =>
    op.kind === 'convert' && extensionOf(input) === 'eml' && ['pdf', 'html', 'txt'].includes(op.id),
  async run(op, input, ctx) {
    const mail = await parse(input);
    const attachments = mail.attachments?.length ?? 0;
    const warning =
      attachments > 0
        ? `${attachments} attachment${attachments === 1 ? ' was' : 's were'} not converted.`
        : undefined;
    if (op.id === 'txt') {
      const head = headerLines(mail)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
      await writeFile(
        ctx.tempPath,
        `${head}\n\n${mail.text ?? htmlToPlain(mail.html ?? '')}\n`,
        'utf8',
      );
      return warning ? { warning } : undefined;
    }
    const head = `<table>${headerLines(mail)
      .map(([k, v]) => `<tr><th align="left">${k}</th><td>${escapeHtml(v)}</td></tr>`)
      .join('')}</table><hr>`;
    const body = mail.html ?? `<pre>${escapeHtml(mail.text ?? '')}</pre>`;
    // Scripts and remote content are stripped: the printed page must not reach the network.
    const safe = body
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<(img|link|iframe)\b[^>]*\b(src|href)=["']https?:[^>]*>/gi, '');
    const html = page(mail.subject ?? basename(input), head + safe);
    if (op.id === 'html') {
      await writeFile(ctx.tempPath, html, 'utf8');
      return warning ? { warning } : undefined;
    }
    if (!htmlToPdfAvailable()) throw new JobError('E_ENGINE_MISSING', 'the PDF printer');
    const work = join(ctx.tempDir, 'src');
    await mkdir(work, { recursive: true });
    const file = join(work, 'mail.html');
    // Fonts this computer lacks become Inter, as for every document printed to PDF.
    await writeFile(file, injectCss(html, await interFallbackCss(html, work)), 'utf8');
    await htmlToPdf(file, ctx.tempPath, ctx.signal);
    return warning ? { warning } : undefined;
  },
};

function htmlToPlain(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/tr|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}
