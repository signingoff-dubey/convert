import { copyFile } from 'node:fs/promises';
import { extensionOf } from '../../shared/formats';
import { JobError, type Engine, type Operation } from '../jobs/types';
import { officeConvert } from './office';
import { renderPages } from './pdf';
import { sheetsEngine } from './sheets';

const SLIDES = new Set(['ppt', 'pptx']);
const SHEETS_VIA_OFFICE_IN = new Set(['xls', 'ods']);
const SHEETS_PLAIN = new Set(['xlsx', 'csv', 'tsv']);

/** Which (input, target) pairs LibreOffice is responsible for. Pure, so the wheel logic can reuse it. */
export function officeHandles(ext: string, target: string): boolean {
  if (SLIDES.has(ext))
    return ['pdf', 'jpg', 'png'].includes(target) || (ext === 'ppt' && target === 'pptx');
  if (SHEETS_VIA_OFFICE_IN.has(ext)) {
    return ['xlsx', 'csv', 'tsv', 'pdf'].includes(target) || (ext === 'xls' && target === 'ods');
  }
  if (SHEETS_PLAIN.has(ext)) return target === 'ods' || target === 'pdf';
  if (ext === 'pdf') return target === 'docx' || target === 'pptx';
  return false;
}

export const officeEngine: Engine = {
  id: 'office',
  canHandle: (op: Operation, input: string) =>
    op.kind === 'convert' && officeHandles(extensionOf(input), op.id),
  async run(op, input, ctx) {
    if (!ctx.officePath) throw new JobError('E_ENGINE_MISSING', 'LibreOffice');
    const ext = extensionOf(input);
    const convert = (from: string, to: string) =>
      officeConvert(ctx.officePath as string, from, to, ctx.tempDir, ctx.signal);

    if (SLIDES.has(ext) && (op.id === 'jpg' || op.id === 'png')) {
      // Slides go to PDF first, then every page is rendered at 300 DPI into the output folder.
      return renderPages(await convert(input, 'pdf'), op.id, ctx);
    }
    if (SHEETS_VIA_OFFICE_IN.has(ext) && (op.id === 'csv' || op.id === 'tsv')) {
      // XLS and ODS become XLSX first so CSV and TSV reuse the spreadsheet engine's parsing and quoting.
      return sheetsEngine.run(op, await convert(input, 'xlsx'), ctx);
    }
    await copyFile(await convert(input, op.id), ctx.tempPath);
  },
};
