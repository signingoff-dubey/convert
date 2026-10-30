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

export type WheelId = 'convert' | 'tools' | 'actions' | 'share';

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
  /** Extensions this target is not offered for, such as reading text from an SVG. */
  notFor?: readonly string[];
}

export interface Tool {
  id: string;
  label: string;
  /** Opens a small tool window instead of running immediately. */
  opensWindow?: boolean;
  /** Minimum and maximum number of selected files the tool accepts. */
  minFiles?: number;
  maxFiles?: number;
  /** Only offered when every selected file has one of these extensions. */
  exts?: readonly string[];
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
    t('txt', 'TXT (read text)', { notFor: ['svg'] }),
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
    t('pdf', 'PDF'),
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
    t('txt', 'TXT'),
    t('pdf', 'PDF', { needsOffice: true }),
  ],
  epub: [t('docx', 'DOCX'), t('md', 'MD'), t('txt', 'TXT'), t('html', 'HTML'), t('pdf', 'PDF')],
  subtitles: [t('srt', 'SRT'), t('vtt', 'VTT'), t('txt', 'TXT')],
  archive: [
    { id: 'extract-here', ext: null, label: 'Extract here' },
    t('zip', 'ZIP'),
    t('tar', 'TAR'),
    t('gz', 'GZIP'),
  ],
};

const COPY_TEXT: Tool = {
  id: 'copy-text',
  label: 'Copy text',
  description:
    'Read the text in pictures, scans and documents and put it on the clipboard. Pictures are read offline, several parts at a time.',
};
const MERGE_MEDIA: Tool = {
  id: 'merge',
  label: 'Merge',
  opensWindow: true,
  minFiles: 2,
  description: 'Join videos or audio files end to end, in the order you choose.',
};
const PASSWORD: Tool = {
  id: 'password',
  label: 'Password',
  opensWindow: true,
  maxFiles: 1,
  description: 'Add a password to a PDF or ZIP, or remove it when you know it.',
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
    {
      id: 'upscale',
      label: 'Upscale',
      opensWindow: true,
      description:
        'Make pictures 2x, 3x or 4x larger with high-quality resampling and optional sharpening. Works on many images at once.',
    },
    {
      id: 'remove-bg',
      label: 'Remove BG',
      opensWindow: true,
      description:
        'Make a plain background transparent. Best for flat or studio backgrounds; works on many images at once.',
    },
    COPY_TEXT,
  ],
  video: [
    { id: 'compress', label: 'Compress' },
    { id: 'trim', label: 'Trim start/end', opensWindow: true, maxFiles: 1 },
    { id: 'extract-audio', label: 'Extract audio' },
    MERGE_MEDIA,
    {
      id: 'frames',
      label: 'Extract frames',
      opensWindow: true,
      description:
        'Save still pictures from a video into a folder, one every second or every frame.',
    },
  ],
  audio: [
    { id: 'compress', label: 'Compress' },
    { id: 'trim', label: 'Trim', opensWindow: true, maxFiles: 1 },
    { id: 'normalize', label: 'Normalize' },
    MERGE_MEDIA,
  ],
  pdf: [
    { id: 'compress', label: 'Compress' },
    { id: 'split', label: 'Split pages', opensWindow: true, maxFiles: 1 },
    {
      id: 'delete-pages',
      label: 'Delete pages',
      opensWindow: true,
      maxFiles: 1,
      description:
        'See every page as a thumbnail, untick the ones to drop, and save the rest as a new PDF.',
    },
    { id: 'merge', label: 'Merge', opensWindow: true, minFiles: 2 },
    PASSWORD,
    COPY_TEXT,
  ],
  document: [
    {
      id: 'merge',
      label: 'Merge',
      opensWindow: true,
      minFiles: 2,
      exts: ['txt', 'md'],
      description: 'Join text or Markdown files into one, in the order you choose.',
    },
    COPY_TEXT,
  ],
  epub: [COPY_TEXT],
  archive: [{ ...PASSWORD, maxFiles: 1, exts: ['zip'] }],
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
    id: 'zip',
    label: 'Zip',
    description: 'Put the selected files and folders into one ZIP, saved beside the first one.',
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
  return CONVERT_TARGETS[category].filter(
    (target) => target.ext !== own && !target.notFor?.includes(own),
  );
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

/**
 * Targets at least one selected file can be converted to, in the default wedge order. Files that are already
 * in the chosen format, or cannot go there, are skipped when the job is dispatched (docs/DECISIONS.md).
 */
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
      perFile.some((ids) => ids.has(target.id)) &&
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
      items.length <= (tool.maxFiles ?? Number.MAX_SAFE_INTEGER) &&
      (!tool.exts || items.every((i) => tool.exts?.includes(extensionOf(i.path)))),
  );
  if (tools.length === 0) return disabled('no-tools');
  return { status: 'ok', category: sel.category, items: tools };
}

/**
 * Apps a file can be handed to. There is no public way to attach a file to another app's chat, so sharing
 * copies the files to the clipboard, opens the app (its desktop version when installed, else its website)
 * and the user pastes with Ctrl+V. Only these fixed addresses are ever opened.
 */
export interface ShareTarget extends Tool {
  /** Custom address that opens the installed desktop app. */
  protocol: string;
  /** Opened in the browser when the desktop app is not installed. */
  web: string;
  /** Matches the title of a browser window that has this web app open (the active tab's title). */
  title: string;
}

export const SHARE_TARGETS: readonly ShareTarget[] = [
  {
    id: 'claude',
    label: 'Claude',
    protocol: 'claude://',
    web: 'https://claude.ai/new',
    title: '^Claude\\b',
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    protocol: 'chatgpt://',
    web: 'https://chatgpt.com/',
    title: '^ChatGPT\\b',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    protocol: 'tg://',
    web: 'https://web.telegram.org/',
    title: '^(\\(\\d+\\) )?Telegram',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    protocol: 'whatsapp://',
    web: 'https://web.whatsapp.com/',
    title: '^(\\(\\d+\\) )?WhatsApp',
  },
  {
    id: 'discord',
    label: 'Discord',
    protocol: 'discord://',
    web: 'https://discord.com/app',
    title: 'Discord',
  },
  {
    id: 'slack',
    label: 'Slack',
    protocol: 'slack://open',
    web: 'https://app.slack.com/client',
    title: 'Slack',
  },
  {
    id: 'email',
    label: 'Email',
    protocol: 'mailto:',
    web: 'https://mail.google.com/mail/?view=cm&fs=1',
    title: '^(Inbox|Gmail|Compose|New Message)',
  },
].map((t) => ({
  ...t,
  description: `Copy the files, open ${t.label} and paste them into a chat with Ctrl+V.`,
}));

/** Sharing works on files of any type, mixed selections included; folders cannot be pasted into a chat. */
export function sharesFor(items: readonly InputItem[]): WheelResult<ShareTarget> {
  if (items.length === 0) return disabled('empty');
  if (items.every((i) => i.isDirectory)) return disabled('folder');
  return { status: 'ok', category: 'archive', items: [...SHARE_TARGETS] };
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
