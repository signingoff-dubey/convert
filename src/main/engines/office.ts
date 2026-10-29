import { mkdir, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { JobError } from '../jobs/types';
import { execFileSafe } from './exec';

export interface OfficeTarget {
  /** soffice --convert-to value, such as "pdf" or "docx:MS Word 2007 XML". */
  convertTo: string;
  /** Optional import filter, needed to open a PDF as a Writer or Impress document. */
  infilter?: string;
  /** Extension of the file LibreOffice writes. */
  ext: string;
}

const FORMATS: Record<string, OfficeTarget> = {
  pdf: { convertTo: 'pdf', ext: 'pdf' },
  html: { convertTo: 'html', ext: 'html' },
  docx: { convertTo: 'docx:MS Word 2007 XML', ext: 'docx' },
  pptx: { convertTo: 'pptx', ext: 'pptx' },
  xlsx: { convertTo: 'xlsx', ext: 'xlsx' },
  ods: { convertTo: 'ods', ext: 'ods' },
  txt: { convertTo: 'txt:Text', ext: 'txt' },
};

/** Builds the soffice arguments for one conversion. Pure, so it can be unit-tested without LibreOffice. */
export function officeArgs(
  input: string,
  target: keyof typeof FORMATS | string,
  outDir: string,
  profileDir: string,
): { args: string[]; ext: string } {
  const fmt = FORMATS[target];
  if (!fmt) throw new JobError('E_UNSUPPORTED', `office target ${target}`);
  const inExt = basename(input).split('.').pop()?.toLowerCase() ?? '';
  // A PDF is opened as a Writer document for DOCX and as an Impress document for PPTX.
  const infilter =
    inExt === 'pdf'
      ? target === 'pptx'
        ? 'impress_pdf_import'
        : 'writer_pdf_import'
      : fmt.infilter;
  return {
    ext: fmt.ext,
    args: [
      '--headless',
      '--norestore',
      '--nologo',
      // A private profile avoids "already running" failures when the user has LibreOffice open.
      `-env:UserInstallation=file:///${profileDir.replace(/\\/g, '/').replace(/^\/+/, '')}`,
      ...(infilter ? [`--infilter=${infilter}`] : []),
      '--convert-to',
      fmt.convertTo,
      '--outdir',
      outDir,
      input,
    ],
  };
}

/** Runs LibreOffice and returns the path of the file it wrote, inside `workDir`. */
export async function officeConvert(
  officePath: string,
  input: string,
  target: string,
  workDir: string,
  signal: AbortSignal,
): Promise<string> {
  const outDir = join(workDir, `office-${target}`);
  const profile = join(workDir, 'office-profile');
  await mkdir(outDir, { recursive: true });
  const { args, ext } = officeArgs(input, target, outDir, profile);
  const res = await execFileSafe(officePath, args, { signal });
  if (res.code !== 0) throw new JobError('E_UNKNOWN', res.stderr.slice(-300));
  const produced = (await readdir(outDir)).find((f) => f.toLowerCase().endsWith(`.${ext}`));
  if (!produced)
    throw new JobError('E_UNSUPPORTED', `LibreOffice could not convert this file to ${target}`);
  return join(outDir, produced);
}
