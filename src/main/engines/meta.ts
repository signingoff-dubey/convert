import { nodeRequire } from './req';
import { JobError, type RunResult } from '../jobs/types';

interface ExifTool {
  deleteAllTags(file: string): Promise<void>;
  end(): Promise<void>;
  version(): Promise<string>;
}

let tool: ExifTool | null = null;

function exiftool(): ExifTool {
  if (tool) return tool;
  // Loaded lazily: starting exiftool costs RAM, and most sessions never strip metadata.
  const mod = nodeRequire('exiftool-vendored') as { exiftool: ExifTool };
  tool = mod.exiftool;
  return tool;
}

/** Strips all metadata from a copy. Callers pass the temp copy, never the source. */
export async function stripMetadata(copyPath: string): Promise<RunResult> {
  try {
    await exiftool().deleteAllTags(copyPath);
    return {};
  } catch (error) {
    throw new JobError('E_ENGINE_MISSING', error instanceof Error ? error.message : 'exiftool');
  }
}

export async function exiftoolVersion(): Promise<string | null> {
  try {
    return await exiftool().version();
  } catch {
    return null;
  }
}

export async function shutdownExiftool(): Promise<void> {
  if (tool) await tool.end().catch(() => undefined);
  tool = null;
}

/** Tags the Metadata window may write. Anything else is ignored, so a crafted payload cannot reach other tags. */
const WRITABLE = new Set([
  'Make',
  'Model',
  'Artist',
  'Copyright',
  'ImageDescription',
  'DateTimeOriginal',
  'LensModel',
  'Software',
]);

const SAFE_VALUE = /^[^\u0000-\u001f]{0,500}$/u;
const EXIF_DATE = /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/;

/** Builds the exiftool tag map from `f_<Tag>` parameters. Pure, so it can be tested without exiftool. */
export function buildTagWrites(params: Record<string, string | number | boolean>): {
  tags: Record<string, string | number>;
  removeGps: boolean;
  removeAll: boolean;
} {
  const tags: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!key.startsWith('f_')) continue;
    const name = key.slice(2);
    const text = String(value);
    if (!SAFE_VALUE.test(text)) continue;
    if (WRITABLE.has(name)) {
      if (name === 'DateTimeOriginal' && text !== '' && !EXIF_DATE.test(text)) continue;
      tags[name] = text;
    }
  }
  const lat = Number(params.f_GPSLatitude);
  const lon = Number(params.f_GPSLongitude);
  if (
    params.f_GPSLatitude !== undefined &&
    params.f_GPSLatitude !== '' &&
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90
  ) {
    // exiftool derives the hemisphere letter from the sign.
    tags.GPSLatitude = lat;
  }
  if (
    params.f_GPSLongitude !== undefined &&
    params.f_GPSLongitude !== '' &&
    Number.isFinite(lon) &&
    Math.abs(lon) <= 180
  ) {
    tags.GPSLongitude = lon;
  }
  return {
    tags,
    removeGps: params.removeGps === true || params.removeGps === 'true',
    removeAll: params.action === 'remove',
  };
}

/** Writes or removes metadata on a copy. Callers pass the temp copy, never the source. */
export async function writeMetadata(
  copyPath: string,
  params: Record<string, string | number | boolean>,
): Promise<RunResult> {
  const plan = buildTagWrites(params);
  if (plan.removeAll) return stripMetadata(copyPath);
  try {
    const t = exiftool() as ExifTool & {
      write(file: string, tags: Record<string, string | number>, args?: string[]): Promise<void>;
    };
    const args = ['-overwrite_original', ...(plan.removeGps ? ['-GPS:all='] : [])];
    if (Object.keys(plan.tags).length === 0 && !plan.removeGps) {
      throw new JobError('E_UNSUPPORTED', 'no metadata changes were made');
    }
    await t.write(copyPath, plan.tags, args);
    return {};
  } catch (error) {
    if (error instanceof JobError) throw error;
    throw new JobError('E_ENGINE_MISSING', error instanceof Error ? error.message : 'exiftool');
  }
}

export interface MetadataView {
  Make?: string;
  Model?: string;
  LensModel?: string;
  Artist?: string;
  Copyright?: string;
  ImageDescription?: string;
  Software?: string;
  DateTimeOriginal?: string;
  GPSLatitude?: number;
  GPSLongitude?: number;
  ImageWidth?: number;
  ImageHeight?: number;
  /** Read-only details shown beside the editable ones. */
  ExposureTime?: number;
  FNumber?: number;
  ISO?: number;
  FocalLength?: string;
  Flash?: string;
  Orientation?: string;
  ColorSpace?: string;
  FileType?: string;
  FileSize?: string;
  CreateDate?: string;
  ModifyDate?: string;
  GPSAltitude?: number;
}

/** exiftool reports magnitude plus a hemisphere letter; the editor works with signed degrees. */
function signed(
  value: number | undefined,
  ref: string | undefined,
  negative: string,
): number | undefined {
  if (value === undefined) return undefined;
  return ref?.trim().toUpperCase().startsWith(negative) ? -Math.abs(value) : value;
}

/** exiftool gives the shutter time as a number or as text such as "1/250". */
function seconds(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return undefined;
  const m = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(value.trim());
  const n = m ? Number(m[1]) / Number(m[2]) : Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Reads the fields the Metadata window shows. */
export async function readMetadata(path: string): Promise<MetadataView> {
  const t = exiftool() as ExifTool & { read(file: string): Promise<Record<string, unknown>> };
  const raw = await t.read(path);
  const str = (k: string): string | undefined => {
    const v = raw[k];
    if (v === undefined || v === null) return undefined;
    return typeof v === 'object' && 'toString' in v ? String(v) : String(v);
  };
  const num = (k: string): number | undefined =>
    typeof raw[k] === 'number' ? (raw[k] as number) : undefined;
  return {
    Make: str('Make'),
    Model: str('Model'),
    LensModel: str('LensModel'),
    Artist: str('Artist'),
    Copyright: str('Copyright'),
    ImageDescription: str('ImageDescription'),
    Software: str('Software'),
    DateTimeOriginal: str('DateTimeOriginal'),
    GPSLatitude: signed(num('GPSLatitude'), str('GPSLatitudeRef'), 'S'),
    GPSLongitude: signed(num('GPSLongitude'), str('GPSLongitudeRef'), 'W'),
    ImageWidth: num('ImageWidth'),
    ImageHeight: num('ImageHeight'),
    ExposureTime: seconds(raw['ExposureTime']),
    FNumber: num('FNumber'),
    ISO: num('ISO'),
    FocalLength: str('FocalLength'),
    Flash: str('Flash'),
    Orientation: str('Orientation'),
    ColorSpace: str('ColorSpace'),
    FileType: str('FileType'),
    FileSize: str('FileSize'),
    CreateDate: str('CreateDate'),
    ModifyDate: str('FileModifyDate') ?? str('ModifyDate'),
    GPSAltitude: num('GPSAltitude'),
  };
}
