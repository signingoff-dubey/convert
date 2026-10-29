import { extensionOf } from '../../shared/formats';
import { archiveEngine } from '../engines/archive';
import { avEngine, avOutputExt } from '../engines/av';
import { docsEngine } from '../engines/docs';
import { toolOutputExt, imageEngine } from '../engines/image';
import { pdfEngine } from '../engines/pdf';
import { sheetsEngine } from '../engines/sheets';
import { subsEngine } from '../engines/subs';
import { mediaKindOf } from '../engines/av-args';
import { JobError, type Engine, type Operation, type OutputKind } from './types';

export const ENGINES: readonly Engine[] = [
  imageEngine,
  avEngine,
  pdfEngine,
  docsEngine,
  sheetsEngine,
  subsEngine,
  archiveEngine,
];

/** Operations that consume the whole selection as one job instead of one job per file. */
export const MULTI_INPUT_OPS = new Set(['merge']);

export function selectEngine(op: Operation, input: string): Engine {
  const engine = ENGINES.find((e) => e.canHandle(op, input));
  if (!engine)
    throw new JobError('E_UNSUPPORTED', `${op.id} on ${extensionOf(input) || 'this file'}`);
  return engine;
}

/** Where an operation's result goes, so the queue can resolve a collision-free name up front. */
export function planOutput(op: Operation, input: string): OutputKind {
  const inExt = extensionOf(input);
  if (op.kind === 'convert') {
    if (op.id === 'extract-here') return { type: 'dir' };
    // A gzip stream holds one file, so multi-file archives become gzip-compressed tars.
    if (op.id === 'gz' && ['zip', 'tar', 'rar'].includes(inExt))
      return { type: 'file', ext: 'tar.gz' };
    if (inExt === 'pdf' && (op.id === 'png' || op.id === 'jpg')) return { type: 'dir' };
    return { type: 'file', ext: mediaKindOf(input) ? avOutputExt(op.id, 'convert', input) : op.id };
  }
  if (op.id === 'split') return { type: 'dir' };
  if (op.id === 'merge') return { type: 'file', ext: 'pdf', suffix: '-merged' };
  if (mediaKindOf(input)) return { type: 'file', ext: avOutputExt(op.id, 'tool', input) };
  if (inExt === 'pdf') return { type: 'file', ext: 'pdf' };
  return { type: 'file', ext: toolOutputExt(input) };
}
