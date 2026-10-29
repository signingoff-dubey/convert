import { readFile } from 'node:fs/promises';
import { nodeRequire } from './req';

/**
 * Parts of a file that a plain conversion cannot carry over. The job still succeeds; the toast says what was
 * left out, so nothing disappears silently.
 */
async function zipNames(path: string): Promise<string[]> {
  try {
    const JSZip = nodeRequire('jszip') as typeof import('jszip');
    return Object.keys((await JSZip.loadAsync(await readFile(path))).files);
  } catch {
    return [];
  }
}

export async function docxLoss(path: string): Promise<string | null> {
  const names = await zipNames(path);
  const charts = names.some((n) => n.startsWith('word/charts/'));
  const embedded = names.some((n) => n.startsWith('word/embeddings/'));
  if (charts && embedded) return 'Charts and embedded files (such as Excel sheets) were left out.';
  if (charts) return 'Charts were left out.';
  if (embedded) return 'Embedded files (such as Excel sheets) were left out.';
  return null;
}

export async function xlsxLoss(path: string): Promise<string | null> {
  const names = await zipNames(path);
  const charts = names.some((n) => n.startsWith('xl/charts/'));
  const pictures = names.some((n) => n.startsWith('xl/media/'));
  if (charts && pictures) return 'Charts and pictures were left out.';
  if (charts) return 'Charts were left out.';
  if (pictures) return 'Pictures were left out.';
  return null;
}

export async function pdfLoss(path: string): Promise<string | null> {
  const bytes = await readFile(path);
  return bytes.includes('/EmbeddedFile') ? 'Files attached to the PDF were not converted.' : null;
}
