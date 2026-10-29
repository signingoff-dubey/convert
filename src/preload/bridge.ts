import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { WINDOW_ACCESS, type PageName } from '../shared/access';
import { deriveAccent } from '../renderer/theme/accent';
import { resolveTheme, THEMES, type ThemeName } from '../renderer/theme/themes';

interface ThemeBoot {
  theme: ThemeName | 'system';
  accent: string;
  prefersDark: boolean;
  animations: string;
}

/** Sets the theme attributes before the first paint, so there is no flash of the wrong theme. */
function applyEarlyTheme(): void {
  let boot: ThemeBoot | null = null;
  try {
    boot = ipcRenderer.sendSync('theme:boot') as ThemeBoot | null;
  } catch {
    return;
  }
  if (!boot) return;
  const apply = (): void => {
    const root = document.documentElement;
    const name = resolveTheme(boot.theme, boot.prefersDark);
    const tokens = THEMES[name];
    const accent = deriveAccent(boot.accent, tokens.dark);
    root.dataset.theme = name;
    root.dataset.motion = boot.animations;
    root.style.setProperty('--accent', accent.accent);
    root.style.setProperty('--accent-hover', accent.accentHover);
    root.style.setProperty('--accent-soft', accent.accentSoft);
    root.style.setProperty('--on-accent', accent.onAccent);
  };
  if (document.documentElement) apply();
  else document.addEventListener('readystatechange', apply, { once: true });
}

/** Exposes one typed, allow-listed API. Renderers never see Node or the file system. */
export function expose(page: PageName): void {
  const access = WINDOW_ACCESS[page];
  applyEarlyTheme();
  contextBridge.exposeInMainWorld('convert', {
    platform: process.platform,
    invoke: (channel: string, payload?: unknown): Promise<unknown> =>
      access.invoke.includes(channel)
        ? ipcRenderer.invoke(channel, payload)
        : Promise.reject(new Error(`blocked channel: ${channel}`)),
    on: (event: string, callback: (payload: unknown) => void): (() => void) => {
      if (!access.on.includes(event)) return () => undefined;
      const handler = (_e: unknown, payload: unknown): void => callback(payload);
      ipcRenderer.on(event, handler);
      return () => ipcRenderer.removeListener(event, handler);
    },
    pathForFile: (file: File): string => webUtils.getPathForFile(file),
  });
}
