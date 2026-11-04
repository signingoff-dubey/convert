import {
  Archive,
  AudioLines,
  BookOpen,
  Captions,
  Braces,
  MapPin,
  Mail,
  Type,
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
  { id: 'data', label: 'Data', icon: Braces, toolsTitle: 'Data tools' },
  { id: 'font', label: 'Fonts', icon: Type, toolsTitle: 'Font tools' },
  { id: 'email', label: 'Email', icon: Mail, toolsTitle: 'Email tools' },
  { id: 'geo', label: 'Maps', icon: MapPin, toolsTitle: 'Map tools' },
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
  data: 'sample.json',
  font: 'sample.ttf',
  email: 'sample.eml',
  geo: 'sample.geojson',
  archive: 'sample.zip',
};

/** The "Supported formats" table; notes mirror what the engines really do. */
export const FORMAT_TABLE: readonly { category: string; formats: string[]; note?: string }[] = [
  {
    category: 'Images',
    formats: ['JPG', 'PNG', 'WebP', 'HEIC', 'TIFF', 'AVIF', 'BMP'],
    note: 'PDF export. SVG input only. HEIC output needs the Windows HEIF extension.',
  },
  {
    category: 'Data',
    formats: ['JSON', 'YAML', 'TOML', 'XML', 'CSV', 'XLSX'],
    note: 'Into each other. CSV and XLSX need a list of records. Contacts (VCF) and calendars (ICS) can be read into any of them. Spreadsheets also export to JSON.',
  },
  { category: 'Fonts', formats: ['TTF', 'OTF', 'WOFF', 'WOFF2'], note: 'To TTF, WOFF or WOFF2.' },
  {
    category: 'Email',
    formats: ['EML'],
    note: 'To PDF, HTML or TXT. Attachments are not converted.',
  },
  {
    category: 'Maps',
    formats: ['GeoJSON', 'KML', 'GPX'],
    note: 'Into each other and CSV (points as longitude and latitude).',
  },
  {
    category: 'Audio',
    formats: ['MP3', 'M4A', 'WAV', 'FLAC', 'OGG', 'Opus', 'AAC', 'AC3', 'AIFF', 'WMA'],
    note: 'AMR and CAF are also read.',
  },
  {
    category: 'Video',
    formats: ['MP4', 'MOV', 'MKV', 'WebM', 'AVI', 'WMV', 'GIF'],
    note: 'MP3 export. Also read: FLV, MPEG, M4V, 3GP, OGV, VOB.',
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
  {
    category: 'Subtitles',
    formats: ['SRT', 'VTT', 'ASS', 'LRC', 'SBV'],
    note: 'Into each other and TXT. SBV is input only. UTF-8 and UTF-16 files.',
  },
  { category: 'Archives', formats: ['ZIP', 'TAR', 'GZIP'], note: 'RAR input only.' },
];

export const ICON_FOR_CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.icon]));
