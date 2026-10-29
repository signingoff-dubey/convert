import type { WheelId } from './formats';

export interface Wedge {
  id: string;
  label: string;
}

/** Settings key for a wheel's per-category preferences, for example "convert:image". */
export function wheelKey(wheel: WheelId, category: string | null): string {
  return `${wheel}:${wheel === 'actions' || category === null ? 'all' : category}`;
}

/**
 * Applies the user's saved order and enabled flags. Wedges missing from the saved order keep their
 * default position after the saved ones, so adding a format in an update never hides it.
 */
export function applyWheelPrefs<T extends Wedge>(
  defaults: readonly T[],
  order: readonly string[] | undefined,
  disabled: readonly string[] | undefined,
): T[] {
  const off = new Set(disabled ?? []);
  const rank = new Map((order ?? []).map((id, i) => [id, i]));
  const sorted = [...defaults].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return defaults.indexOf(a) - defaults.indexOf(b);
  });
  return sorted.filter((w) => !off.has(w.id));
}

export interface WedgeFlag extends Wedge {
  enabled: boolean;
}

/** Like applyWheelPrefs, but keeps disabled wedges in the list (flagged) so Settings can show and re-enable them. */
export function applyWheelPrefsWithFlags<T extends Wedge>(
  defaults: readonly T[],
  order: readonly string[] | undefined,
  disabled: readonly string[] | undefined,
): (T & { enabled: boolean })[] {
  const off = new Set(disabled ?? []);
  return applyWheelPrefs(defaults, order, undefined).map((w) => ({
    ...w,
    enabled: !off.has(w.id),
  }));
}
