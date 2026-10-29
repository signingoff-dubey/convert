import { categoryOf, extensionOf } from '../../shared/formats';
import { archiveEngine } from '../engines/archive';
import { avEngine, avOutputExt } from '../engines/av';
import { docsEngine } from '../engines/docs';
import { toolOutputExt, imageEngine } from '../engines/image';
import { pdfEngine } from '../engines/pdf';
import { sheetsEngine } from '../engines/sheets';
import { subsEngine } from '../engines/subs';
import { mediaKindOf } from '../engines/av-args';
import { officeEngine } from '../engines/office-engine';
import { ocrEngine } from '../engines/ocr';
import { protectEngine } from '../engines/protect';
import { JobError, type Engine, type Operation, type OutputKind } from './types';

export const ENGINES: readonly Engine[] = [
  imageEngine,
  avEngine,
  pdfEngine,
  docsEngine,
  sheetsEngine,
  subsEngine,
  archiveEngine,
  officeEngine,
  ocrEngine,
  protectEngine,
];

/** Operations that consume the whole selection as one job instead of one job per file. */
export const MULTI_INPUT_OPS = new Set(['merge', 'collage', 'zip', 'copy-text']);

/**
 * True when the whole selection is one job: merge and collage always, and the PDF wedge when several
 * images are dropped together ("Combine selected images into one PDF, a page per image").
 */
export function isMultiInput(op: Operation, paths: readonly string[]): boolean {
  if (MULTI_INPUT_OPS.has(op.id)) return true;
  return (
    op.kind === 'convert' &&
    op.id === 'pdf' &&
    paths.length > 1 &&
    paths.every((p) => categoryOf(p) === 'image')
  );
}

/** A merged video keeps the first file's container when ffmpeg can write it; audio keeps its own format. */
function mergedMediaExt(input: string): string {
  const ext = extensionOf(input);
  return mediaKindOf(input) === 'video'
    ? ['mp4', 'mkv', 'webm', 'mov'].includes(ext)
      ? ext
      : 'mp4'
    : ext;
}

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
    // Each archive gets its own folder (or none, when it holds a single item), beside the archive itself.
    if (op.id === 'extract-here') return { type: 'folder', collapseSingle: true };
    // A gzip stream holds one file, so multi-file archives become gzip-compressed tars.
    if (op.id === 'gz' && ['zip', 'tar', 'rar'].includes(inExt))
      return { type: 'file', ext: 'tar.gz' };
    if (inExt === 'pdf' && (op.id === 'png' || op.id === 'jpg')) return { type: 'dir' };
    // Slides render every slide to its own image, in a new folder.
    if ((inExt === 'ppt' || inExt === 'pptx') && (op.id === 'png' || op.id === 'jpg'))
      return { type: 'dir' };
    return { type: 'file', ext: mediaKindOf(input) ? avOutputExt(op.id, 'convert', input) : op.id };
  }
  if (op.id === 'split') return { type: 'dir' };
  if (op.id === 'frames') return { type: 'folder', suffix: ' frames' };
  if (op.id === 'copy-text') return { type: 'clipboard' };
  if (op.id === 'merge') {
    const ext =
      inExt === 'md' || inExt === 'txt' ? inExt : inExt === 'pdf' ? 'pdf' : mergedMediaExt(input);
    return { type: 'file', ext, suffix: '-merged' };
  }
  if (op.id === 'password')
    return {
      type: 'file',
      ext: inExt,
      suffix: op.params?.mode === 'remove' ? '-unlocked' : '-protected',
    };
  if (op.id === 'delete-pages') return { type: 'file', ext: 'pdf', suffix: '-edited' };
  if (op.id === 'upscale')
    return {
      type: 'file',
      ext: toolOutputExt(input),
      suffix: `-${Number(op.params?.factor ?? 2)}x`,
    };
  if (op.id === 'remove-bg') return { type: 'file', ext: 'png', suffix: '-nobg' };
  if (op.id === 'zip') return { type: 'file', ext: 'zip' };
  if (op.id === 'collage') {
    return { type: 'file', ext: op.params?.format === 'jpg' ? 'jpg' : 'png', suffix: '-collage' };
  }
  if (op.id === 'add-bg') {
    const ext = toolOutputExt(input);
    return { type: 'file', ext: ext === 'jpg' ? 'jpg' : 'png', suffix: '-bg' };
  }
  if (op.id === 'annotate-save')
    return {
      type: 'file',
      ext: toolOutputExt(input) === 'jpg' ? 'jpg' : 'png',
      suffix: '-annotated',
    };
  if (op.id === 'redact') return { type: 'file', ext: toolOutputExt(input), suffix: '-redacted' };
  if (op.id === 'crop') return { type: 'file', ext: toolOutputExt(input), suffix: '-cropped' };
  if (op.id === 'edit') return { type: 'file', ext: toolOutputExt(input), suffix: '-edited' };
  if (op.id === 'metadata') return { type: 'file', ext: toolOutputExt(input), suffix: '-metadata' };
  if (mediaKindOf(input)) return { type: 'file', ext: avOutputExt(op.id, 'tool', input) };
  if (inExt === 'pdf') return { type: 'file', ext: 'pdf' };
  return { type: 'file', ext: toolOutputExt(input) };
}
