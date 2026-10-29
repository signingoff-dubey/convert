import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { extensionOf } from '../../shared/formats';
import { JobError, type Engine } from '../jobs/types';
import { sevenZipPath } from './binaries';
import { execFileSafe } from './exec';
import { nodeRequire } from './req';

type PdfLib = typeof import('@cantoo/pdf-lib');
const pdfLib = (): PdfLib => nodeRequire('@cantoo/pdf-lib') as PdfLib;

/** True when the PDF or ZIP needs a password to open, null when that cannot be told. */
export async function isEncrypted(file: string): Promise<boolean | null> {
  const ext = extensionOf(file);
  try {
    if (ext === 'pdf') {
      const doc = await pdfLib().PDFDocument.load(await readFile(file), { ignoreEncryption: true });
      return doc.isEncrypted;
    }
    if (ext === 'zip') {
      const exe = sevenZipPath();
      if (!exe) return null;
      const res = await execFileSafe(exe, ['l', '-slt', '--', file], {});
      if (res.code !== 0) return null;
      return /^Encrypted = \+/m.test(res.stdout);
    }
  } catch {
    return null;
  }
  return null;
}

function password(op: { params?: Record<string, string | number | boolean> }): string {
  const pw = String(op.params?.password ?? '');
  if (pw === '') throw new JobError('E_UNSUPPORTED', 'a password is needed');
  return pw;
}

async function pdfAdd(input: string, pw: string, out: string): Promise<void> {
  const { PDFDocument } = pdfLib();
  const bytes = await readFile(input);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  if (doc.isEncrypted) throw new JobError('E_UNSUPPORTED', 'this PDF already has a password');
  // The same password opens it and unlocks editing, so it is the only one to remember.
  doc.encrypt({ userPassword: pw, ownerPassword: pw, algorithm: 'AES-256' });
  await writeFile(out, await doc.save());
}

async function pdfRemove(input: string, pw: string, out: string): Promise<void> {
  const { PDFDocument } = pdfLib();
  const bytes = await readFile(input);
  const probe = await PDFDocument.load(bytes, { ignoreEncryption: true });
  if (!probe.isEncrypted) throw new JobError('E_UNSUPPORTED', 'this PDF has no password');
  let doc: Awaited<ReturnType<typeof PDFDocument.load>>;
  try {
    doc = await PDFDocument.load(bytes, { password: pw });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new JobError(/password/i.test(message) ? 'E_WRONG_PASSWORD' : 'E_CORRUPT_INPUT', message);
  }
  // Saving the opened document would write the encryption back, so the pages go into a fresh one.
  const clean = await PDFDocument.create();
  for (const page of await clean.copyPages(doc, doc.getPageIndices())) clean.addPage(page);
  clean.setTitle(doc.getTitle() ?? '', { showInWindowTitleBar: true });
  clean.setAuthor(doc.getAuthor() ?? '');
  await writeFile(out, await clean.save());
}

async function zipRewrite(
  input: string,
  mode: 'add' | 'remove',
  pw: string,
  ctx: Parameters<Engine['run']>[2],
): Promise<void> {
  const exe = sevenZipPath();
  if (!exe) throw new JobError('E_ENGINE_MISSING', '7-Zip');
  const encrypted = await isEncrypted(input);
  if (mode === 'add' && encrypted)
    throw new JobError('E_UNSUPPORTED', 'this ZIP already has a password');
  if (mode === 'remove' && encrypted === false)
    throw new JobError('E_UNSUPPORTED', 'this ZIP has no password');
  const work = join(ctx.tempDir, 'unpacked');
  await mkdir(work, { recursive: true });
  // The password is only on the command line of a local child process for the length of the job.
  const extract = await execFileSafe(
    exe,
    ['x', '-y', '-spe', `-o${work}`, ...(mode === 'remove' ? [`-p${pw}`] : []), '--', input],
    { signal: ctx.signal },
  );
  if (extract.code !== 0) {
    const wrong = /wrong password|CRC failed|data error/i.test(extract.stderr + extract.stdout);
    throw new JobError(wrong ? 'E_WRONG_PASSWORD' : 'E_CORRUPT_INPUT', extract.stderr.slice(-300));
  }
  ctx.onProgress(50);
  const names = (await readdir(work)).map((n) => `./${n}`);
  if (names.length === 0) throw new JobError('E_CORRUPT_INPUT', 'the ZIP is empty');
  const args = ['a', '-tzip', '-mx=5', '-y'];
  if (mode === 'add') args.push('-mem=AES256', `-p${pw}`);
  const pack = await execFileSafe(exe, [...args, ctx.tempPath, '--', ...names], {
    signal: ctx.signal,
    cwd: work,
  });
  if (pack.code !== 0) throw new JobError('E_UNKNOWN', pack.stderr.slice(-300));
  await rm(work, { recursive: true, force: true });
}

/** Adds a password to a PDF or ZIP, or removes one the user knows. */
export const protectEngine: Engine = {
  id: 'protect',
  canHandle: (op, input) =>
    op.kind === 'tool' && op.id === 'password' && ['pdf', 'zip'].includes(extensionOf(input)),
  async run(op, input, ctx) {
    const mode = op.params?.mode === 'remove' ? 'remove' : 'add';
    const pw = password(op);
    try {
      if (extensionOf(input) === 'pdf') {
        return await (mode === 'add' ? pdfAdd : pdfRemove)(input, pw, ctx.tempPath);
      }
      return await zipRewrite(input, mode, pw, ctx);
    } catch (error) {
      if (error instanceof JobError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new JobError('E_CORRUPT_INPUT', `${basename(input)}: ${message}`);
    }
  },
};
