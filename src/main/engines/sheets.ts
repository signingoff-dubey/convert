import { nodeRequire } from './req';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { sanitizeName } from '../jobs/naming';
import { extensionOf } from '../../shared/formats';
import { JobError, type Engine, type Operation, type RunContext } from '../jobs/types';
import { xlsxLoss } from './losses';

type Row = (string | number | boolean | Date | null)[];

const DELIMITERS: Record<string, string> = { csv: ',', tsv: '\t' };

interface Sheet {
  name: string;
  rows: Row[];
}

/** Every sheet of a workbook, in order. A CSV or TSV is one unnamed sheet. */
async function readSheets(input: string): Promise<Sheet[]> {
  const ext = extensionOf(input);
  if (ext === 'xlsx') {
    const ExcelJS = nodeRequire('exceljs') as typeof import('exceljs');
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.readFile(input);
    } catch (error) {
      throw new JobError('E_CORRUPT_INPUT', error instanceof Error ? error.message : 'xlsx');
    }
    return wb.worksheets.map((sheet) => {
      const rows: Row[] = [];
      sheet.eachRow({ includeEmpty: true }, (row) => {
        const cells: Row = [];
        for (let c = 1; c <= sheet.columnCount; c++) cells.push(row.getCell(c).text ?? '');
        rows.push(cells);
      });
      return { name: sheet.name, rows };
    });
  }
  const Papa = nodeRequire('papaparse') as typeof import('papaparse');
  const text = (await readFile(input, 'utf8')).replace(/^﻿/, '');
  const parsed = Papa.parse<string[]>(text, {
    delimiter: DELIMITERS[ext] ?? '',
    skipEmptyLines: 'greedy',
  });
  return [{ name: '', rows: parsed.data }];
}

export const sheetsEngine: Engine = {
  id: 'sheets',
  canHandle: (op, input) =>
    op.kind === 'convert' &&
    ['xlsx', 'csv', 'tsv'].includes(extensionOf(input)) &&
    ['xlsx', 'csv', 'tsv', 'txt'].includes(op.id),
  async run(op, input, ctx) {
    await convertSheets(op, input, ctx);
    // Charts and pictures in a workbook cannot be part of CSV, TSV or text.
    const warning =
      op.id !== 'xlsx' && extensionOf(input) === 'xlsx' ? await xlsxLoss(input) : null;
    return warning ? { warning } : undefined;
  },
};

async function convertSheets(op: Operation, input: string, ctx: RunContext): Promise<void> {
  {
    const sheets = await readSheets(input);
    const first = sheets[0]?.rows ?? [];
    if (op.id === 'xlsx') {
      const ExcelJS = nodeRequire('exceljs') as typeof import('exceljs');
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet('Sheet1').addRows(first);
      await wb.xlsx.writeFile(ctx.tempPath);
      return;
    }
    const Papa = nodeRequire('papaparse') as typeof import('papaparse');
    if (op.id === 'txt') {
      // Plain readable text, tab-separated, one row per line; a workbook with several sheets gets a heading for each.
      const unparse = (rows: Row[]): string =>
        Papa.unparse(rows, { delimiter: '\t', newline: '\n', quotes: false });
      const text =
        sheets.length > 1
          ? sheets.map((s) => `## ${s.name}\n${unparse(s.rows)}`).join('\n\n')
          : unparse(first);
      return writeFile(ctx.tempPath, text + '\n', 'utf8');
    }
    // CSV and TSV: one file per sheet, beside the workbook. A single sheet keeps the workbook's name.
    const base = basename(input).replace(/\.[^.]+$/, '');
    const delimiter = DELIMITERS[op.id] ?? ',';
    const many = sheets.length > 1;
    for (const [i, sheet] of sheets.entries()) {
      const name = many ? `${base} - ${sanitizeName(sheet.name || `Sheet ${i + 1}`)}` : base;
      // A BOM makes Excel read UTF-8 correctly.
      await writeFile(
        join(ctx.outDir, `${name}.${op.id}`),
        `\ufeff${Papa.unparse(sheet.rows, { delimiter, newline: '\r\n' })}`,
        'utf8',
      );
      ctx.onProgress(Math.round(((i + 1) / sheets.length) * 100));
    }
  }
}
