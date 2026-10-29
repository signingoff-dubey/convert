import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';

export type Shell = 'wt' | 'powershell' | 'cmd';

export interface LaunchPlan {
  file: string;
  args: string[];
  cwd: string;
}

/** Folder to open: the path itself if it is a directory, otherwise its parent. */
export function folderFor(
  target: string,
  isDirectory = (p: string) => statSync(p).isDirectory(),
): string {
  try {
    return isDirectory(target) ? target : path.dirname(target);
  } catch {
    return path.dirname(target);
  }
}

/**
 * Argument arrays only, never a shell string, so spaces, unicode and `&` in a path are plain data.
 * The folder is also passed as cwd, which is what powershell and cmd use as their start folder.
 */
export function launchPlans(preferred: Shell, folder: string): LaunchPlan[] {
  const plans: Record<Shell, LaunchPlan> = {
    wt: { file: 'wt.exe', args: ['-d', folder], cwd: folder },
    powershell: { file: 'powershell.exe', args: ['-NoExit'], cwd: folder },
    cmd: { file: 'cmd.exe', args: [], cwd: folder },
  };
  const order: Shell[] = [
    preferred,
    ...(['wt', 'powershell', 'cmd'] as const).filter((s) => s !== preferred),
  ];
  return order.map((s) => plans[s]);
}

/** Tries each plan until one starts. Resolves with the shell that opened, or null. */
export async function openTerminal(preferred: Shell, target: string): Promise<Shell | null> {
  const folder = folderFor(target);
  const shells: Shell[] = [
    preferred,
    ...(['wt', 'powershell', 'cmd'] as const).filter((s) => s !== preferred),
  ];
  const plans = launchPlans(preferred, folder);
  for (const [i, plan] of plans.entries()) {
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn(plan.file, plan.args, {
        cwd: plan.cwd,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        shell: false,
      });
      child.once('error', () => resolve(false));
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    });
    if (ok) return shells[i] ?? null;
  }
  return null;
}
