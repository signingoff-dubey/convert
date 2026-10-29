export type ThemeName = 'graphite' | 'paper' | 'midnight';

export interface ThemeTokens {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textMuted: string;
  danger: string;
  success: string;
  dark: boolean;
}

export const THEMES: Record<ThemeName, ThemeTokens> = {
  graphite: {
    bg: '#14151A',
    surface: '#1C1E25',
    surface2: '#252832',
    border: '#2F3340',
    text: '#E8EAF0',
    textMuted: '#9AA0B2',
    danger: '#FF5C6C',
    success: '#3DDC97',
    dark: true,
  },
  paper: {
    bg: '#F6F6F8',
    surface: '#FFFFFF',
    surface2: '#EEEEF2',
    border: '#DADCE3',
    text: '#16171B',
    textMuted: '#5F6475',
    danger: '#D92D43',
    success: '#1E9E64',
    dark: false,
  },
  midnight: {
    bg: '#000000',
    surface: '#0B0B0E',
    surface2: '#141418',
    border: '#22232A',
    text: '#F2F3F7',
    textMuted: '#8B90A0',
    danger: '#FF5C6C',
    success: '#3DDC97',
    dark: true,
  },
};

export const ACCENT_PRESETS = {
  violet: '#7C5CFF',
  cyan: '#19C3E6',
  lime: '#8BD22E',
  rose: '#FF4D7A',
  amber: '#FFB020',
} as const;

/** `system` follows the OS and maps to Graphite or Paper. */
export function resolveTheme(theme: ThemeName | 'system', prefersDark: boolean): ThemeName {
  if (theme === 'system') return prefersDark ? 'graphite' : 'paper';
  return theme;
}
