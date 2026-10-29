import { STRINGS } from '../../shared/strings';
import { acceleratorKey } from '../trigger/keymap';

export type RecordedModifier = 'shift' | 'ctrl' | 'alt' | 'meta';

/** A combo as captured by the recorder; `meta` (Win key) is representable only so it can be blocked. */
export interface RecordedCombo {
  modifiers: readonly RecordedModifier[];
  code: string;
}

export type ComboStatus = 'ok' | 'warning' | 'blocked';
export interface ComboVerdict {
  status: ComboStatus;
  messages: string[];
}

const MODIFIER_ORDER: RecordedModifier[] = ['ctrl', 'alt', 'shift', 'meta'];
const MODIFIER_CODES = /^(Shift|Control|Alt|Meta|OS)(Left|Right)?$/;
const ALLOWED_MAIN = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2]))$/;

export function normalizeCombo(combo: RecordedCombo): RecordedCombo {
  const unique = MODIFIER_ORDER.filter((m) => combo.modifiers.includes(m));
  return { modifiers: unique, code: combo.code };
}

export function comboKey(combo: RecordedCombo): string {
  const n = normalizeCombo(combo);
  return [...n.modifiers, n.code].join('+');
}

export function comboEquals(a: RecordedCombo, b: RecordedCombo): boolean {
  return comboKey(a) === comboKey(b);
}

/** Display form, for example "Shift+C". */
export function formatCombo(combo: RecordedCombo): string {
  const names: Record<RecordedModifier, string> = {
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Shift',
    meta: 'Win',
  };
  const main = acceleratorKey(combo.code) ?? combo.code;
  return [...normalizeCombo(combo).modifiers.map((m) => names[m]), main].join('+');
}

/** Exact denylist from docs/04 section 3. Modifier-only entries (Alt+Shift) are covered by the main-key rule. */
const RESERVED: readonly RecordedCombo[] = [
  { modifiers: ['ctrl', 'alt'], code: 'Delete' },
  { modifiers: ['ctrl', 'shift'], code: 'Escape' },
  { modifiers: ['alt'], code: 'F4' },
  { modifiers: ['alt'], code: 'Tab' },
  { modifiers: ['alt'], code: 'Escape' },
  ...['KeyC', 'KeyV', 'KeyX', 'KeyZ', 'KeyY', 'KeyA', 'KeyS', 'KeyP', 'KeyF', 'KeyW'].map(
    (code): RecordedCombo => ({ modifiers: ['ctrl'], code }),
  ),
  { modifiers: ['shift'], code: 'F10' },
  { modifiers: ['shift'], code: 'Delete' },
  { modifiers: ['ctrl', 'shift'], code: 'KeyN' },
  { modifiers: ['ctrl', 'shift'], code: 'KeyT' },
  { modifiers: ['ctrl', 'shift'], code: 'KeyW' },
];

export function isReserved(combo: RecordedCombo): boolean {
  return RESERVED.some((r) => comboEquals(r, combo));
}

export type ProbeResult = 'free' | 'taken' | 'unknown';

export interface ShortcutApi {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

/**
 * Advisory registration probe (docs/04 section 4). Never leaves a registration behind.
 * Returns 'unknown' when the key has no Electron accelerator or registration throws.
 */
export function probe(combo: RecordedCombo, shortcuts: ShortcutApi): ProbeResult {
  const key = acceleratorKey(combo.code);
  if (key === undefined) return 'unknown';
  const names: Record<RecordedModifier, string> = {
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Shift',
    meta: 'Super',
  };
  const accelerator = [...normalizeCombo(combo).modifiers.map((m) => names[m]), key].join('+');
  let registered = false;
  try {
    registered = shortcuts.register(accelerator, () => undefined);
    return registered ? 'free' : 'taken';
  } catch {
    return 'unknown';
  } finally {
    if (registered) {
      try {
        shortcuts.unregister(accelerator);
      } catch {
        // Nothing more can be done; the probe must not throw.
      }
    }
  }
}

/** Classifies a combo. `others` are the combos of the other two wheels. */
export function validateCombo(
  combo: RecordedCombo,
  others: readonly RecordedCombo[],
  probeResult?: ProbeResult,
): ComboVerdict {
  const c = STRINGS.combo;
  const blocked: string[] = [];
  const warnings: string[] = [];
  const mods = normalizeCombo(combo).modifiers;

  if (mods.length === 0) blocked.push(c.noModifier);
  if (mods.length > 2) blocked.push(c.tooManyModifiers);
  if (mods.includes('meta')) blocked.push(c.winKey);
  if (MODIFIER_CODES.test(combo.code)) blocked.push(c.modifierMainKey);
  else if (!ALLOWED_MAIN.test(combo.code)) blocked.push(c.badMainKey);
  if (isReserved(combo)) blocked.push(c.reserved);
  if (others.some((o) => comboEquals(o, combo))) blocked.push(c.duplicate);

  if (blocked.length > 0) return { status: 'blocked', messages: blocked };

  if (/^F([1-9]|1[0-2])$/.test(combo.code)) warnings.push(c.functionKey);
  if (mods.includes('alt')) warnings.push(c.usesAlt);
  if (probeResult === 'taken') warnings.push(c.taken(formatCombo(combo)));
  if (probeResult === 'unknown') warnings.push(c.cannotCheck);

  return warnings.length > 0
    ? { status: 'warning', messages: warnings }
    : { status: 'ok', messages: [] };
}
