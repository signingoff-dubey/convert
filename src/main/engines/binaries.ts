import { nodeRequire } from './req';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Packaged binaries live outside app.asar so they can be executed. */
export function unpacked(path: string): string {
  return path.replace('app.asar', 'app.asar.unpacked');
}

export function ffmpegPath(): string | null {
  try {
    const p = nodeRequire('ffmpeg-static') as string | null;
    return p ? unpacked(p) : null;
  } catch {
    return null;
  }
}

export function sevenZipPath(): string | null {
  try {
    const mod = nodeRequire('7zip-bin') as { path7za: string };
    return unpacked(mod.path7za);
  } catch {
    return null;
  }
}

const OFFICE_CANDIDATES = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
];

/** Configured path first, then the usual LibreOffice install folders. */
export function detectOffice(configured: string | null): string | null {
  if (configured && existsSync(configured)) return configured;
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(
    (r): r is string => typeof r === 'string' && r !== '',
  );
  const candidates = [
    ...roots.map((r) => join(r, 'LibreOffice', 'program', 'soffice.exe')),
    ...OFFICE_CANDIDATES,
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}
