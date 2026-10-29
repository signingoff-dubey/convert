import { lstat, stat } from 'node:fs/promises';
import { ToolWindowName } from '../shared/ipc';
import { actionsFor, targetsFor, toolsFor, type InputItem, type WheelId } from '../shared/formats';
import { STRINGS } from '../shared/strings';
import { checkDropPath } from './jobs/paths';
import type { JobQueue } from './jobs/queue';
import { runAction, type ActionDeps, type ActionId } from './services/actions';
import { logger } from './services/log';
import type { ToolWindowManager } from './windows/toolwin';

const log = logger('dispatch');

export interface DispatchDeps {
  queue: JobQueue;
  toolwin: ToolWindowManager;
  actions: ActionDeps;
  flags(): { office: boolean; heic: boolean };
  notify(text: string, kind?: 'info' | 'error'): void;
}

/** Main-side re-validation of dropped paths: absolute, not a device path, not protected, and real. */
export async function validateDropped(
  raw: readonly string[],
): Promise<{ items: InputItem[]; skipped: number }> {
  const items: InputItem[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const candidate of raw) {
    const check = checkDropPath(candidate);
    if (!check.ok || seen.has(check.path)) {
      skipped++;
      continue;
    }
    try {
      const l = await lstat(check.path);
      // Follow links so a shortcut to a folder is treated as that folder; reject anything else odd.
      const s = l.isSymbolicLink() ? await stat(check.path) : l;
      if (!s.isFile() && !s.isDirectory()) {
        skipped++;
        continue;
      }
      seen.add(check.path);
      items.push({ path: check.path, isDirectory: s.isDirectory() });
    } catch {
      skipped++;
    }
  }
  return { items, skipped };
}

/** Turns "dropped these files on this wedge" into a job, a tool window or an action. */
export async function dispatchWedge(
  deps: DispatchDeps,
  wheel: WheelId,
  wedgeId: string,
  rawPaths: readonly string[],
): Promise<void> {
  const { items, skipped } = await validateDropped(rawPaths);
  if (items.length === 0) {
    deps.notify(STRINGS.toast.notOnDisk, 'error');
    return;
  }
  if (skipped > 0) log.info(`ignored ${skipped} dropped item(s) that were not usable files`);
  const paths = items.map((i) => i.path);

  if (wheel === 'actions') {
    if (!actionsFor(items).some((a) => a.id === wedgeId)) return;
    await runAction(wedgeId as ActionId, paths, deps.actions);
    return;
  }

  if (wheel === 'convert') {
    const { office, heic } = deps.flags();
    const result = targetsFor(items, { officeAvailable: office, heicEncoder: heic });
    if (result.status !== 'ok' || !result.items.some((t) => t.id === wedgeId)) {
      deps.notify(STRINGS.errors.E_UNSUPPORTED, 'error');
      return;
    }
    deps.queue.enqueue({ id: wedgeId, kind: 'convert' }, paths);
    return;
  }

  const tools = toolsFor(items);
  const tool = tools.status === 'ok' ? tools.items.find((t) => t.id === wedgeId) : undefined;
  if (!tool) {
    deps.notify(STRINGS.errors.E_UNSUPPORTED, 'error');
    return;
  }
  const windowName = ToolWindowName.safeParse(wedgeId);
  if (tool.opensWindow && windowName.success) {
    await deps.toolwin.show(windowName.data, paths);
    return;
  }
  deps.queue.enqueue({ id: wedgeId, kind: 'tool' }, paths);
}
