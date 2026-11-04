import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { app, clipboard, dialog, globalShortcut, ipcMain, nativeTheme, net, shell } from 'electron';
import { registerPreviewScheme, installPreviewHandler } from './protocol';
import { ToolWindowName } from '../shared/ipc';
import { dispatchWedge, type DispatchDeps } from './dispatch';
import { shutdownDetectors } from './engines/detect';
import { setHtmlToPdf } from './engines/html-pdf';
import { shutdownOcr } from './engines/ocr';
import { setPdfBackend } from './engines/pdf';
import { PdfHost } from './services/pdf-host';
import { openInBrowser } from './services/browsers';
import { parseCli } from './services/cli';
import { applySendTo } from './services/sendto';
import { windowFinder } from './services/share';
import type { JobResult } from './jobs/types';
import { MAX_WEB_BYTES, type WebFetchResult } from './services/webdrop';
import { REPO, Updater } from './services/updater';
import { WatchService } from './services/watch';
import { printHtmlToPdf } from './services/print-pdf';
import { detectOffice } from './engines/binaries';
import { heicEncoderAvailable } from './engines/heic';
import { shutdownExiftool } from './engines/meta';
import { registerIpc } from './ipc';
import { JobQueue } from './jobs/queue';
import { OverlayManager } from './overlay/overlay-window';
import { copyFilesToClipboard } from './services/clipboard-files';
import { applyAutostart } from './services/autostart';
import { initLog, logDir, logger, setLogLevel } from './services/log';
import { AppState } from './services/state';
import { openTerminal } from './services/terminal';
import { ToastManager } from './services/toast';
import { TrayService } from './services/tray';
import { SettingsService } from './settings/store';
import { createUiohookSource } from './native/uiohook-source';
import { createWin32 } from './native/win32';
import type { HookSource } from './native/hooks-iface';
import { TriggerEngine } from './trigger/hooks';
import { FloatShelf } from './windows/float-shelf';
import { WindowRegistry } from './windows/registry';
import { SettingsWindow } from './windows/settings-window';
import { CursorLoader } from './windows/cursor-loader';
import { ToastWindow } from './windows/toast-window';
import { ToolWindowManager } from './windows/toolwin';

// Must be registered before the app is ready.
registerPreviewScheme();
app.setName('Convert');

const log = logger('main');

/** Downloads a release file to disk, reporting progress, giving up after 30 minutes. */
async function downloadTo(
  url: string,
  dest: string,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const res = await net.fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30 * 60_000),
  });
  if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`);
  const host = new URL(res.url).hostname;
  if (!/(^|\.)(github\.com|githubusercontent\.com)$/.test(host))
    throw new Error(`unexpected download host ${host}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let seen = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, done) {
      seen += chunk.length;
      if (total > 0) onProgress(Math.min(1, seen / total));
      done(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body as never), counter, createWriteStream(dest));
}

/** Fetches a dragged picture's address, giving up after 30 seconds or 150 MB. Used only when the user drops one. */
async function fetchPublic(url: string): Promise<WebFetchResult> {
  const res = await net.fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
    headers: { 'User-Agent': 'Convert' },
  });
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_WEB_BYTES) {
      await reader.cancel();
      throw new Error('too large');
    }
    chunks.push(value);
  }
  return {
    ok: res.ok,
    url: res.url,
    contentType: res.headers.get('content-type') ?? '',
    bytes: Buffer.concat(chunks),
  };
}

/** A hook source that does nothing, for machines where global hooks are not available. */
const inertSource: HookSource = {
  onMouseDown: () => undefined,
  onMouseUp: () => undefined,
  onMouseMove: () => undefined,
  onKeyDown: () => undefined,
  start: () => undefined,
  stop: () => undefined,
};

async function main(): Promise<void> {
  const userData = app.getPath('userData');
  initLog(path.join(userData, 'logs'), 'info');
  const settings = new SettingsService(userData);
  setLogLevel(settings.load().advanced.logLevel);
  const state = new AppState(userData);
  installPreviewHandler();
  setHtmlToPdf(printHtmlToPdf);

  const registry = new WindowRegistry();
  const pdfHost = new PdfHost(registry);
  setPdfBackend(pdfHost.open);
  const prefersDark = (): boolean => nativeTheme.shouldUseDarkColors;
  const flags = {
    office: detectOffice(settings.get().engines.officeEnginePath) !== null,
    heic: false,
  };
  void heicEncoderAvailable().then((v) => (flags.heic = v));

  const queue = new JobQueue({
    getSettings: () => settings.get(),
    getOfficePath: () => detectOffice(settings.get().engines.officeEnginePath),
    trash: (p) => shell.trashItem(p),
    copyText: (text) => clipboard.writeText(text),
  });

  const toastWindow = new ToastWindow(() => settings.get(), registry);
  const toasts = new ToastManager(toastWindow, () => settings.get(), queue);
  const loader = new CursorLoader(registry, () => settings.get());
  queue.on('update', (snap) => loader.update(snap));
  const settingsWindow = new SettingsWindow(registry, () => settings.get(), prefersDark);
  const toolwin = new ToolWindowManager(registry, () => settings.get(), prefersDark);
  const float = new FloatShelf(
    registry,
    () => settings.get(),
    prefersDark,
    () => state.floatDock,
    (edge) => state.setFloatDock(edge),
  );
  const overlay = new OverlayManager(
    () => settings.get(),
    () => flags,
    registry,
  );

  const watcher = new WatchService({
    convert: (target, file) => queue.enqueue({ id: target, kind: 'convert' }, [file]),
    flags: () => flags,
    notify: (text, kind) => toasts.info(text, kind),
  });
  queue.on('done', (result: JobResult) => {
    watcher.ignore(result.outputs ?? []);
    if (result.status !== 'ok' || !result.output || result.note) return;
    state.addHistory({
      id: result.jobId,
      name: path.basename(result.output),
      output: result.output,
      input: result.input,
      op: result.opId,
      at: Date.now(),
      count: result.outputs?.length ?? 1,
    });
    registry.broadcast(['settings'], 'history:changed', undefined);
  });
  watcher.apply(settings.get().watch.rules);
  const updater = new Updater({
    current: app.getVersion(),
    dir: path.join(userData, 'updates'),
    available: () =>
      !app.isPackaged
        ? { ok: false, reason: 'Updates are only checked in the installed app.' }
        : process.platform !== 'win32'
          ? { ok: false, reason: 'Updates are only available on Windows.' }
          : { ok: true },
    autoInstall: () => settings.get().general.autoUpdate,
    fetchRelease: async () => {
      const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Convert' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
      return res.json();
    },
    download: downloadTo,
    isIdle: () => !queue.isBusy() && toolwin.count() === 0,
    install: (file) => {
      // The installer finishes the job after this app has quit, then starts the new version hidden in the tray.
      spawn(file, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
      app.quit();
    },
    onState: () => registry.broadcast(['settings'], 'update:changed', undefined),
  });
  updater.start();
  const win32 = createWin32();
  const dispatchDeps: DispatchDeps = {
    queue,
    toolwin,
    flags: () => flags,
    notify: (text, kind) => toasts.info(text, kind),
    share: {
      copyFilesToClipboard,
      hasApp: (protocol) => app.getApplicationNameForProtocol(protocol) !== '',
      open: (url) => shell.openExternal(url),
      openWeb: (url) => openInBrowser(url, settings.get().general.shareBrowser),
      findWebWindow: (pattern) => windowFinder(win32)(pattern),
      notify: (text, kind) => toasts.info(text, kind),
    },
    actions: {
      getSettings: () => settings.get(),
      pickFolder: async (defaultPath) => {
        const res = await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory'],
          defaultPath,
        });
        return res.canceled ? null : (res.filePaths[0] ?? null);
      },
      writeClipboard: (text) => clipboard.writeText(text),
      copyFilesToClipboard,
      showItemInFolder: (p) => shell.showItemInFolder(p),
      openTerminal,
      addToFloat: (paths) => void float.add(paths),
      recentFolders: state.recentFolders,
      notify: (text, kind) => toasts.info(text, kind),
    },
  };

  let source: HookSource = inertSource;
  if (process.platform === 'win32') {
    try {
      source = createUiohookSource();
    } catch (error) {
      log.error('global hooks unavailable; the wheel cannot open', error);
      toasts.info('Global input hooks could not start, so the wheel is unavailable.', 'error');
    }
  } else {
    log.info('not running on Windows: global hooks and drag-and-drop are disabled');
  }
  const trigger = new TriggerEngine({
    source,
    win32,
    getSettings: () => settings.get(),
    overlay,
    onRunJob: (wheel, wedgeId, paths) => void dispatchWedge(dispatchDeps, wheel, wedgeId, paths),
    onTestCombo: (combo, wheel) =>
      registry.broadcast(['settings'], 'combo:test:event', { combo, wheelId: wheel }),
  });

  const tray = new TrayService(
    {
      openSettings: () => void settingsWindow.open(),
      togglePause: () => settings.update({ general: { paused: !settings.get().general.paused } }),
      showFloat: () => void float.show(),
      openLog: () => {
        const dir = logDir();
        if (dir) void shell.openPath(dir);
      },
      quit: () => app.quit(),
      isPaused: () => settings.get().general.paused,
    },
    settings.get().appearance.accent,
  );
  await tray.init();
  toasts.onActivity((running) => tray.setBusy(running));

  const shortcuts = {
    register: (accelerator: string, callback: () => void) =>
      globalShortcut.register(accelerator, callback),
    unregister: (accelerator: string) => globalShortcut.unregister(accelerator),
  };

  // Renderers read the theme synchronously in their preload to avoid a flash.
  ipcMain.on('theme:boot', (event) => {
    if (!registry.pageOf(event.sender)) {
      event.returnValue = null;
      return;
    }
    const s = settings.get();
    event.returnValue = {
      theme: s.appearance.theme,
      accent: s.appearance.accent,
      prefersDark: prefersDark(),
      animations: s.appearance.animations,
    };
  });

  registerIpc({
    settings,
    queue,
    trigger,
    toasts,
    toolwin,
    float,
    state,
    registry,
    pdfHost,
    updater,
    web: { dir: app.getPath('downloads'), fetch: fetchPublic },
    dispatch: dispatchDeps,
    shortcuts,
    userData,
    onSettingsReset: () => tray.refresh(),
    setFlags: (f) => Object.assign(flags, f),
  });

  // The overlay loads only after its IPC handlers exist, so its first settings request is answered.
  await overlay.create();

  const applyPause = (): void => {
    try {
      if (settings.get().general.paused) trigger.stop();
      else trigger.start();
    } catch (error) {
      // A hook that cannot start must not take the whole app down; Settings and the tray still work.
      log.error('could not change the state of the global hooks', error);
      toasts.info('Global input hooks could not start, so the wheel is unavailable.', 'error');
    }
    tray.refresh();
  };

  settings.onChange((next) => {
    watcher.apply(next.watch.rules);
    registry.broadcast(
      ['overlay', 'settings', 'toast', 'toolwin', 'float'],
      'settings:changed',
      next,
    );
    applyPause();
    applyAutostart(next.general.startWithWindows, state.firstRunDone);
    void applySendTo(next.general.sendTo);
  });
  nativeTheme.on('updated', () => {
    const s = settings.get();
    if (s.appearance.theme === 'system') {
      registry.broadcast(
        ['overlay', 'settings', 'toast', 'toolwin', 'float'],
        'settings:changed',
        s,
      );
    }
  });

  if (process.platform === 'win32') applyPause();
  applyAutostart(settings.get().general.startWithWindows, state.firstRunDone);
  void applySendTo(settings.get().general.sendTo);

  // Developer aid, only in unpackaged runs: --dev-tool=crop:C:\\path\\photo.png opens a tool window directly.
  const devTool = app.isPackaged
    ? undefined
    : process.argv.find((a) => a.startsWith('--dev-tool='));
  if (devTool) {
    const [name, ...rest] = devTool.slice('--dev-tool='.length).split(':');
    const parsed = ToolWindowName.safeParse(name);
    if (parsed.success && rest.length > 0)
      await toolwin.show(parsed.data, rest.join(':').split('|'));
  }

  // Developer aid, only in unpackaged runs: --dev-job=txt:C:\\path\\scan.png runs one conversion (or tool, with tool:).
  const devJob = app.isPackaged ? undefined : process.argv.find((a) => a.startsWith('--dev-job='));
  if (devJob) {
    const [spec, ...files] = devJob.slice('--dev-job='.length).split('|');
    const [kind, id, ...first] = (spec ?? '').split(':');
    if ((kind === 'convert' || kind === 'tool') && id)
      queue.enqueue({ id, kind }, [first.join(':'), ...files]);
  }

  // `Convert.exe --convert pdf file...` comes from Explorer's Send to menu or a script. A second launch hands
  // its request to this running copy.
  const runCli = (argv: readonly string[]): boolean => {
    const { convert } = parseCli(argv);
    if (!convert) return false;
    void dispatchWedge(dispatchDeps, 'convert', convert.target, convert.files);
    return true;
  };
  app.on('second-instance', (_event, argv) => {
    if (!runCli(argv)) void settingsWindow.open();
  });
  const startedWithRequest = runCli(process.argv);

  // The installer starts the new version with --updated: stay in the tray and say so, instead of opening a window.
  const justUpdated = process.argv.includes('--updated');
  if (justUpdated) toasts.info(`Convert was updated to version ${app.getVersion()}.`);
  const hidden = process.argv.includes('--hidden') || justUpdated;
  if (!state.firstRunDone || (!hidden && !startedWithRequest)) await settingsWindow.open();

  // Closing the settings window leaves Convert running in the tray, so the shortcuts keep working. With
  // "Keep running in the background" off, closing it quits instead.
  let toldAboutTray = false;
  let quitting = false;
  app.on('before-quit', () => (quitting = true));
  settingsWindow.onClosed(() => {
    if (quitting) return;
    if (!settings.get().general.runInBackground) {
      app.quit();
    } else if (!toldAboutTray) {
      toldAboutTray = true;
      toasts.info('Convert is still running in the tray. Right-click the tray icon to quit.');
    }
  });
  app.on('window-all-closed', () => {
    // Convert lives in the tray; closing windows must not quit it.
  });
  app.on('before-quit', () => {
    settings.flush();
    trigger.stop();
    globalShortcut.unregisterAll();
    toolwin.closeAll();
    overlay.destroy();
    toastWindow.destroy();
    loader.destroy();
    pdfHost.destroy();
    updater.stop();
    watcher.stop();
    float.destroy();
    tray.destroy();
    void shutdownExiftool();
    void shutdownDetectors();
    void shutdownOcr();
  });
  log.info(`Convert ${app.getVersion()} started`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  process.on('uncaughtException', (error) => log.error('uncaught exception', error));
  process.on('unhandledRejection', (reason) => log.error('unhandled rejection', reason));
  void app
    .whenReady()
    .then(main)
    .catch((error: unknown) => {
      log.error('startup failed', error);
      dialog.showErrorBox(
        'Convert could not start',
        error instanceof Error ? error.message : String(error),
      );
      app.quit();
    });
}
