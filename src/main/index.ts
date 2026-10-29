import path from 'node:path';
import { app, clipboard, dialog, globalShortcut, ipcMain, nativeTheme, shell } from 'electron';
import { registerPreviewScheme, installPreviewHandler } from './protocol';
import { ToolWindowName } from '../shared/ipc';
import { dispatchWedge, type DispatchDeps } from './dispatch';
import { shutdownDetectors } from './engines/detect';
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
import { ToastWindow } from './windows/toast-window';
import { ToolWindowManager } from './windows/toolwin';

// Must be registered before the app is ready.
registerPreviewScheme();
app.setName('Convert');

const log = logger('main');

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

  const registry = new WindowRegistry();
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
  });

  const toastWindow = new ToastWindow(() => settings.get(), registry);
  const toasts = new ToastManager(toastWindow, () => settings.get(), queue);
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

  const dispatchDeps: DispatchDeps = {
    queue,
    toolwin,
    flags: () => flags,
    notify: (text, kind) => toasts.info(text, kind),
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

  const win32 = createWin32();
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
    registry.broadcast(
      ['overlay', 'settings', 'toast', 'toolwin', 'float'],
      'settings:changed',
      next,
    );
    applyPause();
    applyAutostart(next.general.startWithWindows, state.firstRunDone);
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

  const hidden = process.argv.includes('--hidden');
  if (!state.firstRunDone || !hidden) await settingsWindow.open();

  app.on('second-instance', () => void settingsWindow.open());
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
    float.destroy();
    tray.destroy();
    void shutdownExiftool();
    void shutdownDetectors();
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
