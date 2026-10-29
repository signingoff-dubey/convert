import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { detectOffice, sevenZipPath } from './binaries';
import { ffmpegVersion } from './av';
import { execFileSafe } from './exec';
import { heicEncoderAvailable } from './heic';
import { exiftoolVersion } from './meta';
import { nodeRequire } from './req';

export interface EngineStatus {
  id: string;
  label: string;
  ready: boolean;
  version: string | null;
  optional: boolean;
  detail?: string;
}

function pkgVersion(name: string): string | null {
  try {
    return (
      JSON.parse(readFileSync(nodeRequire.resolve(`${name}/package.json`), 'utf8')) as {
        version: string;
      }
    ).version;
  } catch {
    return null;
  }
}

async function sevenZipVersion(): Promise<string | null> {
  const exe = sevenZipPath();
  if (!exe) return null;
  let line = '';
  await execFileSafe(exe, [], { onStdoutLine: (l) => (line ||= l.trim()) }).catch(() => null);
  return /(\d+\.\d+)/.exec(line)?.[1] ?? null;
}

/** Live status for Settings, then Engines. Optional engines explain why a wedge is hidden. */
export async function engineStatus(configuredOffice: string | null): Promise<EngineStatus[]> {
  const [ffmpeg, exif, seven, heic] = await Promise.all([
    ffmpegVersion(),
    exiftoolVersion(),
    sevenZipVersion(),
    heicEncoderAvailable(),
  ]);
  const office = detectOffice(configuredOffice);
  const sharpVersion = sharp.versions.sharp;
  const pdfLib = pkgVersion('pdf-lib');
  const pdfjs = pkgVersion('pdfjs-dist');
  return [
    {
      id: 'ffmpeg',
      label: 'Audio and video (ffmpeg)',
      ready: ffmpeg !== null,
      version: ffmpeg,
      optional: false,
    },
    { id: 'image', label: 'Images (sharp)', ready: true, version: sharpVersion, optional: false },
    {
      id: 'pdf',
      label: 'PDF (pdf-lib, pdf.js)',
      ready: pdfLib !== null && pdfjs !== null,
      version: pdfLib && pdfjs ? `${pdfLib} / ${pdfjs}` : null,
      optional: false,
    },
    {
      id: 'exiftool',
      label: 'Metadata (exiftool)',
      ready: exif !== null,
      version: exif,
      optional: false,
      detail: exif === null ? 'Needs Perl on non-Windows systems; bundled on Windows.' : undefined,
    },
    {
      id: '7zip',
      label: 'Archives (7-Zip)',
      ready: seven !== null,
      version: seven,
      optional: false,
    },
    {
      id: 'ocr',
      label: 'Text detection (Tesseract, offline)',
      ready: pkgVersion('tesseract.js') !== null,
      version: pkgVersion('tesseract.js'),
      optional: false,
    },
    {
      id: 'faces',
      label: 'Face detection (offline model)',
      ready: pkgVersion('@vladmandic/face-api') !== null,
      version: pkgVersion('@vladmandic/face-api'),
      optional: false,
    },
    {
      id: 'office',
      label: 'Office engine (LibreOffice)',
      ready: office !== null,
      version: office,
      optional: true,
      detail: office
        ? undefined
        : 'Install LibreOffice to enable PDF export from documents, slides and spreadsheets, plus PDF to DOCX/PPTX, ODS and XLS.',
    },
    {
      id: 'heic',
      label: 'HEIC output (Windows HEIF extension)',
      ready: heic,
      version: null,
      optional: true,
      detail: heic
        ? undefined
        : 'Install "HEIF Image Extensions" from the Microsoft Store to enable HEIC output.',
    },
  ];
}
