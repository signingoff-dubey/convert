import { create } from 'zustand';
import type { Settings } from '../../main/settings/schema';
import { deriveAccent } from '../theme/accent';
import { resolveTheme, THEMES } from '../theme/themes';
import { invoke, on } from './api';

interface SettingsState {
  settings: Settings | null;
  prefersDark: boolean;
  init(): Promise<void>;
  patch(patch: Record<string, unknown>): Promise<void>;
}

/** Writes theme, accent and motion onto the document root so every window updates live, with no restart. */
export function applyTheme(settings: Settings, prefersDark: boolean): void {
  const root = document.documentElement;
  const name = resolveTheme(settings.appearance.theme, prefersDark);
  const accent = deriveAccent(settings.appearance.accent, THEMES[name].dark);
  root.dataset.theme = name;
  root.dataset.motion = settings.appearance.animations;
  root.style.setProperty('--accent', accent.accent);
  root.style.setProperty('--accent-hover', accent.accentHover);
  root.style.setProperty('--accent-soft', accent.accentSoft);
  root.style.setProperty('--on-accent', accent.onAccent);
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  async init() {
    const settings = (await invoke('settings:get')) as Settings;
    applyTheme(settings, get().prefersDark);
    set({ settings });
    on<Settings>('settings:changed', (next) => {
      applyTheme(next, get().prefersDark);
      set({ settings: next });
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      set({ prefersDark: e.matches });
      const s = get().settings;
      if (s) applyTheme(s, e.matches);
    });
  },
  async patch(patch) {
    // Optimistic: the UI changes at once, and main's broadcast confirms it.
    const next = (await invoke('settings:set', { patch })) as Settings;
    applyTheme(next, get().prefersDark);
    set({ settings: next });
  },
}));
