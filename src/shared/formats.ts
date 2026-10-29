import { STRINGS } from './strings';

export type Category =
  'image' | 'audio' | 'video' | 'pdf' | 'document' | 'spreadsheet' | 'subtitles' | 'archive';

export type WheelId = 'convert' | 'tools' | 'actions';

export interface InputItem {
  path: string;
  isDirectory: boolean;
}

export interface Target {
  /** Stable wedge id. */
  id: string;
  /** Output extension (no dot), or null for operations without a single output file. */
  ext: string | null;
  label: string;
  /** Hidden unless the optional Office engine is available. */
  needsOffice?: boolean;
}

export interface Tool {
  id: string;
  label: string;
  /** Opens a small tool window instead of running immediately. */
  opensWindow?: boolean;
  /** Minimum and maximum number of selected files the tool accepts. */
  minFiles?: number;
  maxFiles?: number;
}

export type DisabledReason = 'empty' | 'mixed-categories' | 'folder' | 'unknown-type' | 'no-tools';

export type WheelResult<T> =
  | { status: 'ok'; category: Category; items: T[] }
  | { status: 'disabled'; reason: DisabledReason; hint: string };

export const EXTENSIONS: Record<Category, readonly string[]> = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'tif', 'tiff', 'avif', 'bmp'],
  audio: ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus', 'wma', 'aiff'],
  video: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'wmv'],
  pdf: ['pdf'],
  document: ['docx', 'md', 'txt', 'html', 'htm'],
  spreadsheet: ['xlsx', 'csv', 'tsv'],
  subtitles: ['srt', 'vtt'],
  archive: ['zip', 'tar', 'gz', 'rar'],
};

/** Extensions that name the same format. */
const ALIASES: Record<string, string> = { jpeg: 'jpg', tif: 'tiff', htm: 'html' };

const t = (id: string, label: string, extra: Partial<Target> = {}): Target => ({
  id,
  ext: id,
  label,
  ...extra,
});

/** Default wedge order per source category (docs/01 section 4.1). */
export const CONVERT_TARGETS: Record<Category, readonly Target[]> = {
  image: [
    t('png', 'PNG'),
    t('jpg', 'JPG'),
    t('webp', 'WebP'),
    t('avif', 'AVIF'),
    t('tiff', 'TIFF'),
    t('bmp', 'BMP'),
    t('pdf', 'PDF'),
  ],
  audio: [
    t('mp3', 'MP3'),
    t('m4a', 'M4A'),
    t('wav', 'WAV'),
    t('flac', 'FLAC'),
    t('ogg', 'OGG'),
    t('opus', 'Opus'),
  ],
  video: [
    t('mp4', 'MP4'),
    t('webm', 'WebM'),
    t('mkv', 'MKV'),
    t('gif', 'GIF'),
    t('mp3', 'MP3 (extract audio)'),
  ],
  pdf: [t('png', 'PNG'), t('jpg', 'JPG'), t('txt', 'TXT'), t('md', 'MD')],
  document: [
    t('pdf', 'PDF', { needsOffice: true }),
    t('txt', 'TXT'),
    t('md', 'MD'),
    t('html', 'HTML'),
    t('docx', 'DOCX'),
  ],
  spreadsheet: [t('xlsx', 'XLSX'), t('csv', 'CSV'), t('tsv', 'TSV')],
  subtitles: [t('srt', 'SRT'), t('vtt', 'VTT'), t('txt', 'TXT')],
  archive: [
    { id: 'extract-here', ext: null, label: 'Extract here' },
    t('zip', 'ZIP'),
    t('tar', 'TAR'),
    t('gz', 'GZ'),
  ],
};

/** Tools wheel, v1 only (docs/01 section 4.2). */
export const TOOLS: Partial<Record<Category, readonly Tool[]>> = {
  image: [
    { id: 'compress', label: 'Compress' },
    { id: 'resize', label: 'Resize' },
    { id: 'rotate', label: 'Rotate' },
    { id: 'flip', label: 'Flip' },
    { id: 'strip-metadata', label: 'Strip metadata' },
  ],
  video: [
    { id: 'compress', label: 'Compress' },
    { id: 'trim', label: 'Trim start/end', opensWindow: true, maxFiles: 1 },
    { id: 'extract-audio', label: 'Extract audio' },
  ],
  audio: [
    { id: 'compress', label: 'Compress' },
    { id: 'trim', label: 'Trim', opensWindow: true, maxFiles: 1 },
    { id: 'normalize', label: 'Normalize' },
  ],
  pdf: [
    { id: 'compress', label: 'Compress' },
    { id: 'split', label: 'Split pages', opensWindow: true, maxFiles: 1 },
    { id: 'merge', label: 'Merge', opensWindow: true, minFiles: 2 },
  ],
};

export const ACTIONS: readonly Tool[] = [
  { id: 'copy', label: 'Copy' },
  { id: 'move', label: 'Move' },
  { id: 'copy-path', label: 'Copy Path' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'float', label: 'Float' },
  { id: 'reveal', label: 'Reveal' },
];

/** Lowercase extension without the dot, with aliases folded (jpeg to jpg). Works on Windows and POSIX paths. */
export function extensionOf(path: string): string {
  const name = path.slice(Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')) + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  const ext = name.slice(dot + 1).toLowerCase();
  return ALIASES[ext] ?? ext;
}

const CATEGORY_BY_EXT: ReadonlyMap<string, Category> = new Map(
  (Object.keys(EXTENSIONS) as Category[]).flatMap((cat) =>
    EXTENSIONS[cat].map((ext): [string, Category] => [ALIASES[ext] ?? ext, cat]),
  ),
);

export function categoryOf(path: string): Category | null {
  return CATEGORY_BY_EXT.get(extensionOf(path)) ?? null;
}

/** HEIC is input-only in v1; a source never offers its own format as a target. */
function targetsForFile(path: string, category: Category): Target[] {
  const own = extensionOf(path);
  return CONVERT_TARGETS[category].filter((target) => target.ext !== own);
}

function disabled<T>(reason: DisabledReason): WheelResult<T> {
  const hints: Record<DisabledReason, string> = {
    empty: '',
    'mixed-categories': STRINGS.hints.mixedCategories,
    folder: STRINGS.hints.folder,
    'unknown-type': STRINGS.hints.unknownType,
    'no-tools': STRINGS.hints.noTools,
  };
  return { status: 'disabled', reason, hint: hints[reason] };
}

/** Resolves the single category of a selection, or the reason the Convert and Tools wheels are disabled. */
function selectionCategory(
  items: readonly InputItem[],
): { category: Category } | { reason: DisabledReason } {
  if (items.length === 0) return { reason: 'empty' };
  if (items.some((item) => item.isDirectory)) return { reason: 'folder' };
  const categories = items.map((item) => categoryOf(item.path));
  if (categories.some((c) => c === null)) {
    return { reason: categories.every((c) => c === null) ? 'unknown-type' : 'mixed-categories' };
  }
  const first = categories[0] as Category;
  if (categories.some((c) => c !== first)) return { reason: 'mixed-categories' };
  return { category: first };
}

export interface TargetOptions {
  officeAvailable: boolean;
}

/** Targets common to every selected file (docs/01 section 3), in the default wedge order. */
export function targetsFor(
  items: readonly InputItem[],
  options: TargetOptions = { officeAvailable: false },
): WheelResult<Target> {
  const sel = selectionCategory(items);
  if ('reason' in sel) return disabled(sel.reason);
  const perFile = items.map(
    (item) => new Set(targetsForFile(item.path, sel.category).map((x) => x.id)),
  );
  const common = CONVERT_TARGETS[sel.category].filter(
    (target) =>
      perFile.every((ids) => ids.has(target.id)) &&
      (!target.needsOffice || options.officeAvailable),
  );
  return { status: 'ok', category: sel.category, items: common };
}

/** Tools available for every selected file. */
export function toolsFor(items: readonly InputItem[]): WheelResult<Tool> {
  const sel = selectionCategory(items);
  if ('reason' in sel) return disabled(sel.reason);
  const tools = (TOOLS[sel.category] ?? []).filter(
    (tool) =>
      items.length >= (tool.minFiles ?? 1) &&
      items.length <= (tool.maxFiles ?? Number.MAX_SAFE_INTEGER),
  );
  if (tools.length === 0) return disabled('no-tools');
  return { status: 'ok', category: sel.category, items: tools };
}

/** Actions work on anything, including folders and mixed selections. */
export function actionsFor(items: readonly InputItem[]): Tool[] {
  return items.length === 0 ? [] : [...ACTIONS];
}
