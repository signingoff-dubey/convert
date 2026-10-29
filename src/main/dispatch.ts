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
    if (wedgeId === 'zip') {
      // Zip is a real job, so it gets progress, a toast, Show in folder and Undo.
      deps.queue.enqueue({ id: 'zip', kind: 'tool' }, paths);
      return;
    }
    await runAction(wedgeId as ActionId, paths, deps.actions);
    return;
  }

  if (wheel === 'convert') {
    const { office, heic } = deps.flags();
    const options = { officeAvailable: office, heicEncoder: heic };
    const result = targetsFor(items, options);
    const target = result.status === 'ok' ? result.items.find((t) => t.id === wedgeId) : undefined;
    if (!target) {
      deps.notify(STRINGS.errors.E_UNSUPPORTED, 'error');
      return;
    }
    // A mixed selection (some PNG, some JPG) can still be sent to JPG: files already in that format, or that
    // cannot become it, are skipped and the rest are converted.
    const convertible = items.filter((item) => {
      const one = targetsFor([item], options);
      return one.status === 'ok' && one.items.some((t) => t.id === wedgeId);
    });
    if (convertible.length === 0) {
      deps.notify(STRINGS.toast.nothingToDo(target.label.replace(' (extract audio)', '')), 'info');
      return;
    }
    if (convertible.length < items.length) {
      deps.notify(
        STRINGS.toast.skipped(
          items.length - convertible.length,
          target.label.replace(' (extract audio)', ''),
        ),
        'info',
      );
    }
    deps.queue.enqueue(
      { id: wedgeId, kind: 'convert' },
      convertible.map((i) => i.path),
    );
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
