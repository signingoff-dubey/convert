import { STRINGS } from './strings';

export type Category =
  | 'image'
  | 'audio'
  | 'video'
  | 'pdf'
  | 'document'
  | 'slides'
  | 'spreadsheet'
  | 'epub'
  | 'subtitles'
  | 'archive';

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
  /** Hidden unless this machine can encode HEIC (Windows HEIF extension). */
  needsHeicEncoder?: boolean;
}

export interface Tool {
  id: string;
  label: string;
  /** Opens a small tool window instead of running immediately. */
  opensWindow?: boolean;
  /** Minimum and maximum number of selected files the tool accepts. */
  minFiles?: number;
  maxFiles?: number;
  /** Short description for the Features page. */
  description?: string;
}

export type DisabledReason = 'empty' | 'mixed-categories' | 'folder' | 'unknown-type' | 'no-tools';

export type WheelResult<T> =
  | { status: 'ok'; category: Category; items: T[] }
  | { status: 'disabled'; reason: DisabledReason; hint: string };

export const EXTENSIONS: Record<Category, readonly string[]> = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'tif', 'tiff', 'avif', 'bmp', 'svg'],
  audio: ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus', 'wma', 'aiff', 'aif'],
  video: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'wmv', 'gif'],
  pdf: ['pdf'],
  document: ['docx', 'md', 'txt', 'html', 'htm', 'rtf'],
  slides: ['ppt', 'pptx'],
  spreadsheet: ['xlsx', 'xls', 'ods', 'csv', 'tsv'],
  epub: ['epub'],
  subtitles: ['srt', 'vtt'],
  archive: ['zip', 'tar', 'gz', 'tgz', 'rar'],
};

/** Extensions that name the same format. */
const ALIASES: Record<string, string> = {
  jpeg: 'jpg',
  tif: 'tiff',
  htm: 'html',
  heif: 'heic',
  aif: 'aiff',
  tgz: 'gz',
};

const t = (id: string, label: string, extra: Partial<Target> = {}): Target => ({
  id,
  ext: id,
  label,
  ...extra,
});

/** Default wedge order per source category. A wheel never shows the source's own format. */
export const CONVERT_TARGETS: Record<Category, readonly Target[]> = {
  image: [
    t('png', 'PNG'),
    t('jpg', 'JPG'),
    t('webp', 'WebP'),
    t('heic', 'HEIC', { needsHeicEncoder: true }),
    t('tiff', 'TIFF'),
    t('avif', 'AVIF'),
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
    t('aiff', 'AIFF'),
    t('wma', 'WMA'),
  ],
  video: [
    t('mp4', 'MP4'),
    t('mov', 'MOV'),
    t('mkv', 'MKV'),
    t('webm', 'WebM'),
    t('avi', 'AVI'),
    t('wmv', 'WMV'),
    t('gif', 'GIF'),
    t('mp3', 'MP3 (extract audio)'),
  ],
  pdf: [
    t('docx', 'DOCX', { needsOffice: true }),
    t('pptx', 'PPTX', { needsOffice: true }),
    t('xlsx', 'XLSX'),
    t('jpg', 'JPG'),
    t('png', 'PNG'),
    t('epub', 'EPUB'),
    t('txt', 'TXT'),
    t('md', 'MD'),
  ],
  document: [
    t('pdf', 'PDF', { needsOffice: true }),
    t('docx', 'DOCX'),
    t('md', 'MD'),
    t('txt', 'TXT'),
    t('html', 'HTML'),
    t('epub', 'EPUB'),
  ],
  slides: [
    t('pdf', 'PDF', { needsOffice: true }),
    t('jpg', 'JPG', { needsOffice: true }),
    t('png', 'PNG', { needsOffice: true }),
    t('pptx', 'PPTX', { needsOffice: true }),
  ],
  spreadsheet: [
    t('xlsx', 'XLSX'),
    t('ods', 'ODS', { needsOffice: true }),
    t('csv', 'CSV'),
    t('tsv', 'TSV'),
    t('pdf', 'PDF', { needsOffice: true }),
  ],
  epub: [
    t('docx', 'DOCX'),
    t('md', 'MD'),
    t('txt', 'TXT'),
    t('html', 'HTML'),
    t('pdf', 'PDF', { needsOffice: true }),
  ],
  subtitles: [t('srt', 'SRT'), t('vtt', 'VTT'), t('txt', 'TXT')],
  archive: [
    { id: 'extract-here', ext: null, label: 'Extract here' },
    t('zip', 'ZIP'),
    t('tar', 'TAR'),
    t('gz', 'GZIP'),
  ],
};

/** Tools wheel (docs/01 section 4.2, extended with the editors from the product reference). */
export const TOOLS: Partial<Record<Category, readonly Tool[]>> = {
  image: [
    {
      id: 'compress',
      label: 'Compress',
      opensWindow: true,
      description:
        'Choose a target file size, percentage reduction, or preset. Resize while compressing.',
    },
    {
      id: 'redact',
      label: 'Redact',
      opensWindow: true,
      maxFiles: 1,
      description:
        'Detect faces or text locally, then cover private areas with a solid color or blur.',
    },
    {
      id: 'metadata',
      label: 'Metadata',
      opensWindow: true,
      maxFiles: 1,
      description: 'Edit camera and location tags, or remove metadata.',
    },
    {
      id: 'edit',
      label: 'Edit',
      opensWindow: true,
      maxFiles: 1,
      description: 'Adjust exposure, color, detail, effects and more while previewing the result.',
    },
    {
      id: 'crop',
      label: 'Crop',
      opensWindow: true,
      maxFiles: 1,
      description: 'Crop to an aspect ratio or exact dimensions.',
    },
    {
      id: 'add-bg',
      label: 'Add BG',
      opensWindow: true,
      maxFiles: 1,
      description:
        'Place a photo on a solid color, gradient or another image, with spacing and rounded corners.',
    },
    {
      id: 'annotate',
      label: 'Annotate',
      opensWindow: true,
      maxFiles: 1,
      description: 'Add arrows, shapes, text and numbered callouts.',
    },
    {
      id: 'collage',
      label: 'Collage',
      opensWindow: true,
      minFiles: 2,
      description: 'Combine images in a grid, row, column or featured layout.',
    },
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
  {
    id: 'copy',
    label: 'Copy',
    description: 'Copy files to the clipboard, ready to paste in Explorer.',
  },
  {
    id: 'move',
    label: 'Move',
    description: 'Choose a destination folder and move the originals there.',
  },
  {
    id: 'copy-path',
    label: 'Copy Path',
    description: 'Copy full file paths as text, one path per line for a selection.',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    description: "Open a folder, or a file's containing folder, in a terminal.",
  },
  {
    id: 'float',
    label: 'Float',
    description:
      'Keep files in a floating shelf. Dock it to a screen edge and drag files into another app.',
  },
  {
    id: 'copy-to',
    label: 'Copy to',
    description: 'Copy files into a folder you pick, leaving the originals in place.',
  },
  { id: 'reveal', label: 'Reveal', description: 'Open Explorer with the file selected.' },
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
  /** Whether this machine can encode HEIC output. */
  heicEncoder?: boolean;
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
      (!target.needsOffice || options.officeAvailable) &&
      (!target.needsHeicEncoder || options.heicEncoder === true),
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

/** MIME type to a representative extension. Used before the drop, when only MIME types are readable. */
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/tiff': 'tiff',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/x-ms-wma': 'wma',
  'audio/aiff': 'aiff',
  'audio/x-aiff': 'aiff',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'video/webm': 'webm',
  'video/x-msvideo': 'avi',
  'video/avi': 'avi',
  'video/x-ms-wmv': 'wmv',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
  'application/epub+zip': 'epub',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/markdown': 'md',
  'text/plain': 'txt',
  'text/html': 'html',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'application/vnd.ms-excel': 'xls',
  'text/tab-separated-values': 'tsv',
  'application/x-subrip': 'srt',
  'text/vtt': 'vtt',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/x-tar': 'tar',
  'application/gzip': 'gz',
  'application/x-gzip': 'gz',
  'application/vnd.rar': 'rar',
  'application/x-rar-compressed': 'rar',
};

/**
 * Builds placeholder items from the MIME types a drag exposes before the drop. An empty or unknown
 * MIME type becomes an item with no known extension, so the wheel disables itself honestly.
 */
export function itemsFromMimeTypes(mimes: readonly string[]): InputItem[] {
  return mimes.map((mime, i) => {
    const ext = MIME_EXT[mime.toLowerCase()];
    return { path: ext ? `item${i}.${ext}` : `item${i}`, isDirectory: false };
  });
}
