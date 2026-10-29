import {
  Archive,
  AudioLines,
  BookOpen,
  Captions,
  FileText,
  Film,
  Image,
  Presentation,
  Table2,
  type LucideIcon,
  FileType,
} from 'lucide-react';
import type { Category } from '../../shared/formats';

export interface CategoryInfo {
  id: Category;
  label: string;
  icon: LucideIcon;
  /** Tools heading, such as "Image tools". */
  toolsTitle: string;
}

/** Order matches the product tabs: Images, Video, Audio, PDF, Documents, Slides, Spreadsheets, EPUB, Subtitles, Archives. */
export const CATEGORIES: readonly CategoryInfo[] = [
  { id: 'image', label: 'Images', icon: Image, toolsTitle: 'Image tools' },
  { id: 'video', label: 'Video', icon: Film, toolsTitle: 'Video tools' },
  { id: 'audio', label: 'Audio', icon: AudioLines, toolsTitle: 'Audio tools' },
  { id: 'pdf', label: 'PDF', icon: FileType, toolsTitle: 'PDF tools' },
  { id: 'document', label: 'Documents', icon: FileText, toolsTitle: 'Document tools' },
  { id: 'slides', label: 'Slides', icon: Presentation, toolsTitle: 'Slide tools' },
  { id: 'spreadsheet', label: 'Spreadsheets', icon: Table2, toolsTitle: 'Spreadsheet tools' },
  { id: 'epub', label: 'EPUB', icon: BookOpen, toolsTitle: 'EPUB tools' },
  { id: 'subtitles', label: 'Subtitles', icon: Captions, toolsTitle: 'Subtitle tools' },
  { id: 'archive', label: 'Archives', icon: Archive, toolsTitle: 'Archive tools' },
];

/** A representative source file per category, for the preview wheels. */
export const SAMPLE_FILE: Record<Category, string> = {
  image: 'sample.jpg',
  video: 'sample.mov',
  audio: 'sample.wav',
  pdf: 'sample.pdf',
  document: 'sample.docx',
  slides: 'sample.pptx',
  spreadsheet: 'sample.xlsx',
  epub: 'sample.epub',
  subtitles: 'sample.srt',
  archive: 'sample.zip',
};

/** The "Supported formats" table; notes mirror what the engines really do. */
export const FORMAT_TABLE: readonly { category: string; formats: string[]; note?: string }[] = [
  {
    category: 'Images',
    formats: ['JPG', 'PNG', 'WebP', 'HEIC', 'TIFF', 'AVIF', 'BMP'],
    note: 'PDF export. SVG input only. HEIC output needs the Windows HEIF extension.',
  },
  { category: 'Audio', formats: ['MP3', 'M4A', 'WAV', 'FLAC', 'OGG', 'Opus', 'AIFF', 'WMA'] },
  {
    category: 'Video',
    formats: ['MP4', 'MOV', 'MKV', 'WebM', 'AVI', 'WMV', 'GIF'],
    note: 'MP3 export. GIF is also an input.',
  },
  {
    category: 'PDF',
    formats: ['DOCX', 'PPTX', 'XLSX', 'JPG', 'PNG', 'EPUB', 'TXT', 'MD'],
    note: 'All pages, images at 300 DPI. DOCX and PPTX need LibreOffice. XLSX is best effort.',
  },
  {
    category: 'Documents',
    formats: ['DOCX', 'Markdown', 'TXT', 'HTML', 'EPUB', 'PDF'],
    note: 'RTF input. PDF export needs LibreOffice.',
  },
  {
    category: 'Slides',
    formats: ['PPT', 'PPTX', 'PDF', 'JPG', 'PNG'],
    note: 'All slide conversions need LibreOffice. PPT input only for PPTX output.',
  },
  {
    category: 'Spreadsheets',
    formats: ['XLSX', 'ODS', 'CSV', 'TSV', 'PDF'],
    note: 'XLS input only. ODS and PDF need LibreOffice.',
  },
  {
    category: 'EPUB',
    formats: ['EPUB', 'DOCX', 'MD', 'TXT', 'HTML', 'PDF'],
    note: 'Read and write. PDF export needs LibreOffice.',
  },
  { category: 'Subtitles', formats: ['SRT', 'VTT'], note: 'TXT export.' },
  { category: 'Archives', formats: ['ZIP', 'TAR', 'GZIP'], note: 'RAR input only.' },
];

export const ICON_FOR_CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.icon]));
