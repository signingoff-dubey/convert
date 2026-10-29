import { execFileSafe } from '../engines/exec';

/**
 * Puts files on the Windows clipboard as a file drop, so Explorer can paste them.
 * The paths travel as JSON on stdin, never inside the script text.
 */
export const CLIPBOARD_SCRIPT =
  '$p = [Console]::In.ReadToEnd() | ConvertFrom-Json; Set-Clipboard -LiteralPath @($p)';

export async function copyFilesToClipboard(paths: readonly string[]): Promise<boolean> {
  if (process.platform !== 'win32' || paths.length === 0) return false;
  try {
    const res = await execFileSafe(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', CLIPBOARD_SCRIPT],
      { stdin: JSON.stringify(paths) },
    );
    return res.code === 0;
  } catch {
    return false;
  }
}
