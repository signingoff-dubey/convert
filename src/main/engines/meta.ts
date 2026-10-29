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
