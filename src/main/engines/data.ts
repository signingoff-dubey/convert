import { readFile, stat, writeFile } from 'node:fs/promises';
import { extensionOf } from '../../shared/formats';
import { JobError, type Engine, type Operation } from '../jobs/types';
import { nodeRequire } from './req';

const DATA_EXTS = new Set(['json', 'yaml', 'toml', 'xml']);
const TARGETS = new Set(['json', 'yaml', 'toml', 'xml', 'csv', 'xlsx']);
const MAX_BYTES = 100 * 1024 * 1024;

type Json = unknown;
type Row = Record<string, unknown>;

/** Text for a table cell: nested values are written as JSON so nothing is lost. */
export function cell(v: unknown): string | number | boolean {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v as string | number | boolean;
}

/** The list of records a table can be made from: a list, or an object holding one list, or one record. */
export function recordsOf(value: Json): Row[] {
  let list: unknown = value;
  if (!Array.isArray(list) && typeof list === 'object' && list !== null) {
    const arrays = Object.values(list).filter(Array.isArray);
    list = arrays.length === 1 ? arrays[0] : [list];
  }
  // A lone value (a string or number) becomes a one-row table.
  if (!Array.isArray(list)) list = [{ value: list }];
  return (list as unknown[]).map((r) =>
    typeof r === 'object' && r !== null && !Array.isArray(r) ? (r as Row) : { value: r },
  );
}

/** Rows for a spreadsheet: a header row of every key seen, then one row per record. */
export function tableOf(records: Row[]): (string | number | boolean)[][] {
  const columns: string[] = [];
  for (const r of records)
    for (const k of Object.keys(r)) if (!columns.includes(k)) columns.push(k);
  return [columns, ...records.map((r) => columns.map((c) => cell(r[c])))];
}

/** TOML cannot hold null, so those values are left out. Returns what was removed. */
function stripNulls(value: Json, dropped: { n: number }): Json {
  if (Array.isArray(value))
    return value.filter((v) => v !== null).map((v) => stripNulls(v, dropped));
  if (typeof value === 'object' && value !== null) {
    const out: Row = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === undefined) dropped.n++;
      else out[k] = stripNulls(v, dropped);
    }
    return out;
  }
  return value;
}

async function parse(input: string, ext: string): Promise<Json> {
  if ((await stat(input)).size > MAX_BYTES)
    throw new JobError('E_UNSUPPORTED', 'the file is over 100 MB');
  const text = (await readFile(input, 'utf8')).replace(/^﻿/, '');
  try {
    switch (ext) {
      case 'json':
        return JSON.parse(text) as Json;
      case 'yaml': {
        const YAML = nodeRequire('yaml') as typeof import('yaml');
        return YAML.parse(text) as Json;
      }
      case 'toml': {
        const TOML = nodeRequire('smol-toml') as typeof import('smol-toml');
        return TOML.parse(text) as Json;
      }
      default: {
        const { XMLParser } = nodeRequire('fast-xml-parser') as typeof import('fast-xml-parser');
        return new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(
          text,
        ) as Json;
      }
    }
  } catch (error) {
    throw new JobError('E_CORRUPT_INPUT', error instanceof Error ? error.message : `${ext} syntax`);
  }
}

async function convert(
  op: Operation,
  input: string,
  tempPath: string,
): Promise<{ warning?: string }> {
  const value = await parse(input, extensionOf(input));
  switch (op.id) {
    case 'json':
      await writeFile(tempPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
      return {};
    case 'yaml': {
      const YAML = nodeRequire('yaml') as typeof import('yaml');
      await writeFile(tempPath, YAML.stringify(value), 'utf8');
      return {};
    }
    case 'toml': {
      const TOML = nodeRequire('smol-toml') as typeof import('smol-toml');
      const dropped = { n: 0 };
      let root = stripNulls(value, dropped);
      let note = '';
      if (typeof root !== 'object' || root === null || Array.isArray(root)) {
        // TOML must start with a table, so a bare list or value goes under a key.
        root = { items: root };
        note = 'TOML cannot start with a list, so it is stored under "items". ';
      }
      await writeFile(tempPath, TOML.stringify(root as Row) + '\n', 'utf8');
      const warning =
        `${note}${dropped.n > 0 ? `${dropped.n} empty values were left out, since TOML has no null.` : ''}`.trim();
      return warning ? { warning } : {};
    }
    case 'xml': {
      const { XMLBuilder } = nodeRequire('fast-xml-parser') as typeof import('fast-xml-parser');
      let root: Json = value;
      const single =
        typeof root === 'object' &&
        root !== null &&
        !Array.isArray(root) &&
        Object.keys(root).length === 1;
      if (!single) root = { root: { item: root } };
      const xml = new XMLBuilder({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        format: true,
      }).build(root);
      await writeFile(tempPath, `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`, 'utf8');
      return {};
    }
    case 'csv': {
      const Papa = nodeRequire('papaparse') as typeof import('papaparse');
      await writeFile(
        tempPath,
        `﻿${Papa.unparse(tableOf(recordsOf(value)), { newline: '\r\n' })}`,
        'utf8',
      );
      return {};
    }
    default: {
      const ExcelJS = nodeRequire('exceljs') as typeof import('exceljs');
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet('Sheet1').addRows(tableOf(recordsOf(value)));
      await wb.xlsx.writeFile(tempPath);
      return {};
    }
  }
}

/** JSON, YAML, TOML and XML into each other, and into CSV or XLSX when the data is a list of records. */
export const dataEngine: Engine = {
  id: 'data',
  canHandle: (op, input) =>
    op.kind === 'convert' &&
    DATA_EXTS.has(extensionOf(input)) &&
    TARGETS.has(op.id) &&
    extensionOf(input) !== op.id,
  run: (op, input, ctx) => convert(op, input, ctx.tempPath),
};
