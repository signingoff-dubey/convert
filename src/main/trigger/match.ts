import type { WheelId } from '../../shared/formats';
import type { Combo } from '../settings/schema';
import { keycodeFor } from './keymap';

export interface Modifiers {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

const WHEELS: WheelId[] = ['convert', 'tools', 'actions'];

/** Wheels whose main key is this keycode, regardless of modifiers. */
export function wheelsForKeycode(triggers: Record<WheelId, Combo>, keycode: number): WheelId[] {
  return WHEELS.filter((w) => keycodeFor(triggers[w].code) === keycode);
}

/** Exact match: the combo's modifiers must be held and no others. */
export function matchWheel(
  triggers: Record<WheelId, Combo>,
  keycode: number,
  mods: Modifiers,
): WheelId | null {
  for (const wheel of wheelsForKeycode(triggers, keycode)) {
    const need = triggers[wheel].modifiers;
    if (
      need.includes('shift') === mods.shift &&
      need.includes('ctrl') === mods.ctrl &&
      need.includes('alt') === mods.alt
    ) {
      return wheel;
    }
  }
  return null;
}
