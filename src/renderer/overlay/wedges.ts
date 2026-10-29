import {
  actionsFor,
  itemsFromMimeTypes,
  targetsFor,
  toolsFor,
  type InputItem,
  type WheelId,
} from '../../shared/formats';
import { applyWheelPrefs, wheelKey } from '../../shared/wheels';
import { WEDGE_ICONS } from '../components/icons';
import type { WedgeView } from '../components/Wheel';

export interface WheelModel {
  title: string;
  hint?: string;
  disabled: boolean;
  wedges: WedgeView[];
  /** Used to key the per-category order and enabled settings. */
  category: string | null;
}

export interface Prefs {
  order: Record<string, string[]>;
  disabled: Record<string, string[]>;
}

const TITLES: Record<WheelId, string> = { convert: 'Convert', tools: 'Tools', actions: 'Actions' };
const PLACEHOLDER: WedgeView[] = Array.from({ length: 6 }, (_, i) => ({
  id: `ph${i}`,
  label: '',
  enabled: false,
}));

/**
 * What a wheel shows for a selection. Before the drop only MIME types are readable, so this takes the
 * placeholder items from itemsFromMimeTypes; the drop is re-checked in main against the real files.
 */
export function buildWheel(
  wheel: WheelId,
  items: readonly InputItem[] | null,
  prefs: Prefs,
  flags: { office: boolean; heic: boolean },
): WheelModel {
  const title = TITLES[wheel];
  if (items === null)
    return {
      title,
      hint: 'Move onto the wheel',
      disabled: true,
      wedges: PLACEHOLDER,
      category: null,
    };

  if (wheel === 'actions') {
    const base = actionsFor(items).map((a) => ({
      id: a.id,
      label: a.label,
      icon: WEDGE_ICONS[a.id],
      enabled: true,
    }));
    const key = wheelKey('actions', null);
    return {
      title,
      disabled: base.length === 0,
      wedges: applyWheelPrefs(base, prefs.order[key], prefs.disabled[key]),
      category: null,
    };
  }

  if (wheel === 'convert') {
    const result = targetsFor(items, { officeAvailable: flags.office, heicEncoder: flags.heic });
    if (result.status !== 'ok')
      return { title, hint: result.hint, disabled: true, wedges: PLACEHOLDER, category: null };
    const base = result.items.map((t) => ({
      id: t.id,
      label: t.label.replace(' (extract audio)', ''),
      enabled: true,
    }));
    const key = wheelKey('convert', result.category);
    return {
      title,
      disabled: false,
      wedges: applyWheelPrefs(base, prefs.order[key], prefs.disabled[key]),
      category: result.category,
    };
  }

  const result = toolsFor(items);
  if (result.status !== 'ok')
    return { title, hint: result.hint, disabled: true, wedges: PLACEHOLDER, category: null };
  const base = result.items.map((t) => ({
    id: t.id,
    label: t.label,
    icon: WEDGE_ICONS[t.id],
    enabled: true,
  }));
  const key = wheelKey('tools', result.category);
  return {
    title,
    disabled: false,
    wedges: applyWheelPrefs(base, prefs.order[key], prefs.disabled[key]),
    category: result.category,
  };
}

export { itemsFromMimeTypes };
