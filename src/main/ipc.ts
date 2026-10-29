import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app, dialog, ipcMain, nativeTheme, shell, type IpcMainInvokeEvent } from 'electron';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { z, ZodError } from 'zod';
import { categoryOf } from '../shared/formats';
import { STRINGS } from '../shared/strings';
import {
  CHANNELS,
  WINDOW_ACCESS,
  type ChannelName,
  type Request,
  type Response,
  type ToolWindowName,
} from '../shared/ipc';
import { validateDropped, type DispatchDeps } from './dispatch';
import { probeDuration } from './engines/av';
import { detectOffice } from './engines/binaries';
import { detectTextBoxes, readFaceModel } from './engines/detect';
import { engineStatus } from './engines/status';
import { readMetadata } from './engines/meta';
import type { JobQueue } from './jobs/queue';
import { checkDropPath } from './jobs/paths';
import type { Operation } from './jobs/types';
import { logDir, logger, setLogLevel } from './services/log';
import type { AppState } from './services/state';
import type { ToastManager } from './services/toast';
import { migrate } from './settings/migrate';
import { probe, validateCombo, type RecordedCombo, type ShortcutApi } from './settings/conflicts';
import { Settings } from './settings/schema';
import type { SettingsService } from './settings/store';
import type { TriggerEngine } from './trigger/hooks';
import type { FloatShelf } from './windows/float-shelf';
import type { WindowRegistry } from './windows/registry';
import type { ToolWindowManager } from './windows/toolwin';
import type { WheelId } from '../shared/formats';

const log = logger('ipc');

export interface IpcContext {
  settings: SettingsService;
  queue: JobQueue;
  trigger: TriggerEngine;
  toasts: ToastManager;
  toolwin: ToolWindowManager;
  float: FloatShelf;
  state: AppState;
  registry: WindowRegistry;
  dispatch: DispatchDeps;
  shortcuts: ShortcutApi;
  onSettingsReset(): void;
  setFlags(flags: { office?: boolean }): void;
  userData: string;
}

type Handler<C extends ChannelName> = (
  payload: Request<C>,
  event: IpcMainInvokeEvent,
) => Promise<Response<C>> | Response<C>;

export function registerIpc(ctx: IpcContext): void {
  /** Every handler checks who is calling, then validates the payload with zod before touching it. */
  function handle<C extends ChannelName>(channel: C, fn: Handler<C>): void {
    ipcMain.handle(channel, async (event, payload: unknown) => {
      const page = ctx.registry.pageOf(event.sender);
      if (!page || !WINDOW_ACCESS[page].invoke.includes(channel)) {
        log.error(`blocked ${channel} from ${page ?? 'unknown window'}`);
        throw new Error('not allowed');
      }
      let parsed: Request<C>;
      try {
        parsed = CHANNELS[channel].request.parse(payload) as Request<C>;
      } catch (error) {
        log.error(`bad payload on ${channel}`, error instanceof ZodError ? error.issues : error);
        throw new Error('invalid request');
      }
      return fn(parsed, event);
    });
  }

  const current = (): Settings => ctx.settings.get();
  const others = (wheel: WheelId): RecordedCombo[] =>
    (['convert', 'tools', 'actions'] as const)
      .filter((w) => w !== wheel)
      .map((w) => current().triggers[w]);

  // ---- settings
  handle('settings:get', () => current());
  handle('settings:set', ({ patch }) => {
    try {
      const next = ctx.settings.update(patch);
      setLogLevel(next.advanced.logLevel);
      return next;
    } catch (error) {
      if (error instanceof ZodError) throw new Error('Those settings are not valid.');
      throw error;
    }
  });
  handle('settings:reset', () => {
    const next = ctx.settings.reset();
    ctx.onSettingsReset();
    return next;
  });
  handle('settings:export', async () => {
    const res = await dialog.showSaveDialog({
      defaultPath: 'convert-settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false };
    await writeFile(res.filePath, JSON.stringify(current(), null, 2));
    return { ok: true };
  });
  handle('settings:import', async () => {
    const res = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    const file = res.filePaths[0];
    if (res.canceled || !file) return { ok: false };
    try {
      const parsed = Settings.safeParse(migrate(JSON.parse(readFileSync(file, 'utf8'))));
      if (!parsed.success)
        return { ok: false, error: 'That file is not a valid Convert settings file.' };
      ctx.settings.replace(parsed.data);
      return { ok: true };
    } catch {
      return { ok: false, error: 'That file could not be read.' };
    }
  });

  // ---- key combos
  handle('combo:validate', ({ combo, wheelId }) => {
    const verdict = validateCombo(combo, others(wheelId));
    if (verdict.status === 'blocked') return verdict;
    const result = probe(combo, ctx.shortcuts);
    return { ...validateCombo(combo, others(wheelId), result), probe: result };
  });
  handle('combo:recheck', () => {
    const out: Record<
      string,
      ReturnType<typeof validateCombo> & { probe: ReturnType<typeof probe> }
    > = {};
    for (const w of ['convert', 'tools', 'actions'] as const) {
      const combo = current().triggers[w];
      const result = probe(combo, ctx.shortcuts);
      out[w] = { ...validateCombo(combo, others(w), result), probe: result };
    }
    return out;
  });
  handle('combo:test:toggle', ({ on }) => ctx.trigger.setTestMode(on));

  // ---- overlay
  handle('overlay:drop', async ({ wheelId, wedgeId, paths }) => {
    ctx.trigger.handleOverlayDrop(wheelId, { kind: 'wedge', wedgeId }, paths);
  });
  handle('overlay:cancel', (payload) => {
    ctx.trigger.cancelOverlay();
    if (payload?.reason === 'not-on-disk') ctx.dispatch.notify(STRINGS.toast.notOnDisk, 'error');
  });

  // ---- jobs and toasts
  handle('job:cancel', ({ jobId }) => ctx.queue.cancel(jobId));
  handle('job:undo', async ({ jobId }) => void (await ctx.queue.undo(jobId)));
  handle('job:reveal', ({ jobId }) => {
    // Opens the original's folder with the first result selected.
    const out = ctx.queue.outputOf(jobId);
    if (out) shell.showItemInFolder(out);
  });
  handle('toast:dismiss', ({ id }) => ctx.toasts.dismiss(id));

  // ---- tool windows
  const allowedFor = (event: IpcMainInvokeEvent, file: string): boolean =>
    ctx.toolwin.isAllowed(event.sender.id, file);

  handle('toolwin:close', (_p, event) => ctx.toolwin.closeFor(event.sender.id));
  handle('toolwin:probe', async ({ path: file }, event) => {
    if (!allowedFor(event, file)) throw new Error('not allowed');
    if (categoryOf(file) === 'pdf') {
      const doc = await PDFDocument.load(readFileSync(file), { ignoreEncryption: true }).catch(
        () => null,
      );
      return { durationSec: null, pages: doc?.getPageCount() ?? null };
    }
    return { durationSec: await probeDuration(file), pages: null };
  });
  handle('dialog:pick-image', async (_p, event) => {
    const res = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp', 'heic', 'svg'],
        },
      ],
    });
    const file = res.filePaths[0];
    if (res.canceled || !file || !checkDropPath(file).ok) return null;
    ctx.toolwin.allow(event.sender.id, file);
    return file;
  });
  handle('meta:read', async ({ path: file }, event) => {
    if (!allowedFor(event, file)) throw new Error('not allowed');
    const view = await readMetadata(file).catch(() => ({}));
    return Object.fromEntries(
      Object.entries(view).filter((e): e is [string, string | number] => e[1] !== undefined),
    );
  });
  handle('detect:text', async ({ path: file }, event) => {
    if (!allowedFor(event, file)) throw new Error('not allowed');
    return detectTextBoxes(file, path.join(ctx.userData, 'ocr-cache'));
  });
  handle('detect:face-model', async () => readFaceModel());
  handle('annotate:save', async ({ sourcePath, data }, event) => {
    if (!allowedFor(event, sourcePath)) throw new Error('not allowed');
    // The canvas export is staged in the temp folder under a fixed name pattern the engine checks again.
    const tmp = path.join(tmpdir(), `convert-annot-${randomBytes(4).toString('hex')}.png`);
    await writeFile(tmp, data);
    ctx.queue.enqueue({ id: 'annotate-save', kind: 'tool', params: { tmp } }, [sourcePath]);
    ctx.toolwin.closeFor(event.sender.id);
  });
  handle('toolwin:run', async ({ tool, paths, params }, event) => {
    const info = ctx.toolwin.infoFor(event.sender.id);
    if (!info || info.tool !== tool) throw new Error('not allowed');
    // Every file the window names must be one it was opened with or picked itself.
    const files = paths.map((p) => path.resolve(p));
    if (!files.every((f) => info.allowed.has(f))) throw new Error('not allowed');
    if (
      typeof params.bgImage === 'string' &&
      params.bgImage !== '' &&
      !info.allowed.has(path.resolve(params.bgImage))
    ) {
      throw new Error('not allowed');
    }
    const { items } = await validateDropped(files);
    if (items.length === 0) return;
    const op: Operation = { id: tool as ToolWindowName, kind: 'tool', params };
    ctx.queue.enqueue(
      op,
      items.map((i) => i.path),
    );
    ctx.toolwin.closeFor(event.sender.id);
  });

  // ---- float shelf
  handle('float:list', () => ctx.float.list());
  handle('float:remove', ({ path: file }) => ctx.float.remove(file));
  handle('float:clear', () => ctx.float.clear());
  handle('float:close', () => ctx.float.hide());
  handle('float:dock', ({ edge }) => {
    ctx.state.setFloatDock(edge);
    ctx.float.dock(edge);
  });
  handle('float:state', () => ({ edge: ctx.float.edge() }));
  handle('float:drag', async ({ path: file }, event) => ctx.float.startDrag(event.sender, file));

  // ---- dialogs, shell, engines, app
  handle('dialog:pick-folder', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return res.canceled ? null : (res.filePaths[0] ?? null);
  });
  handle('shell:open-logs', () => {
    const dir = logDir();
    if (dir) void shell.openPath(dir);
  });
  handle('engines:status', () => engineStatus(current().engines.officeEnginePath));
  handle('engines:detect-office', () => {
    const found = detectOffice(null);
    if (found) ctx.settings.update({ engines: { officeEnginePath: found } });
    ctx.setFlags({ office: found !== null });
    return found;
  });
  handle('app:meta', () => ({
    version: app.getVersion(),
    platform: process.platform,
    prefersDark: nativeTheme.shouldUseDarkColors,
    firstRun: !ctx.state.firstRunDone,
  }));
  handle('app:licenses', () => {
    const candidates = [
      path.join(process.resourcesPath ?? '', 'LICENSES.md'),
      path.join(app.getAppPath(), 'docs', 'LICENSES.md'),
    ];
    const file = candidates.find((c) => existsSync(c));
    return file ? readFileSync(file, 'utf8') : 'License list not found.';
  });
  handle('app:onboarding', ({ on }) =>
    ctx.trigger.setExtraClasses(on ? ['Chrome_WidgetWin_1'] : []),
  );
  handle('app:first-run-done', () => ctx.state.setFirstRunDone(true));
  handle('app:reset-first-run', () => ctx.state.setFirstRunDone(false));
  let samplePath: string | null = null;
  handle('app:sample-file', async () => {
    // A small generated PNG, never an asset from anywhere else.
    samplePath = path.join(tmpdir(), 'convert-sample.png');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C5CFF"/><stop offset="1" stop-color="#19C3E6"/></linearGradient></defs><rect width="320" height="200" rx="16" fill="url(#g)"/><circle cx="240" cy="64" r="26" fill="#ffffffcc"/><path d="M0 200 L110 90 L190 160 L240 120 L320 200Z" fill="#00000033"/></svg>`;
    await writeFile(samplePath, await sharp(Buffer.from(svg)).png().toBuffer());
    return samplePath;
  });
  handle('app:sample-drag', async (_p, event) => {
    if (samplePath) await ctx.float.startDragOf(event.sender, samplePath);
  });
}

export const FLOAT_DEFAULT = z.undefined();
