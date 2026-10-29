import { nodeRequire } from './req';
import { readFile, writeFile } from 'node:fs/promises';
import { extensionOf } from '../../shared/formats';
import { JobError, type Engine } from '../jobs/types';

type Row = (string | number | boolean | Date | null)[];

const DELIMITERS: Record<string, string> = { csv: ',', tsv: '\t' };

async function readRows(input: string): Promise<Row[]> {
  const ext = extensionOf(input);
  if (ext === 'xlsx') {
    const ExcelJS = nodeRequire('exceljs') as typeof import('exceljs');
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.readFile(input);
    } catch (error) {
      throw new JobError('E_CORRUPT_INPUT', error instanceof Error ? error.message : 'xlsx');
    }
    const sheet = wb.worksheets[0];
    if (!sheet) return [];
    const rows: Row[] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: Row = [];
      for (let c = 1; c <= sheet.columnCount; c++) cells.push(row.getCell(c).text ?? '');
      rows.push(cells);
    });
    return rows;
  }
  const Papa = nodeRequire('papaparse') as typeof import('papaparse');
  const text = (await readFile(input, 'utf8')).replace(/^﻿/, '');
  const parsed = Papa.parse<string[]>(text, {
    delimiter: DELIMITERS[ext] ?? '',
    skipEmptyLines: 'greedy',
  });
  return parsed.data;
}

export const sheetsEngine: Engine = {
  id: 'sheets',
  canHandle: (op, input) =>
    op.kind === 'convert' &&
    ['xlsx', 'csv', 'tsv'].includes(extensionOf(input)) &&
    ['xlsx', 'csv', 'tsv'].includes(op.id),
  async run(op, input, ctx) {
    const rows = await readRows(input);
    if (op.id === 'xlsx') {
      const ExcelJS = nodeRequire('exceljs') as typeof import('exceljs');
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet('Sheet1').addRows(rows);
      await wb.xlsx.writeFile(ctx.tempPath);
      return;
    }
    const Papa = nodeRequire('papaparse') as typeof import('papaparse');
    const text = Papa.unparse(rows, { delimiter: DELIMITERS[op.id] ?? ',', newline: '\r\n' });
    // A BOM makes Excel read UTF-8 correctly.
    await writeFile(ctx.tempPath, `﻿${text}`, 'utf8');
  },
};
