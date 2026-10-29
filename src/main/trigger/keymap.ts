// Maps KeyboardEvent.code to libuiohook keycodes (PS/2 set 1 scancodes on Windows).
// [Likely] correct; Phase 0 / Phase 2 must confirm against a live hook on Windows.

const ROWS: Record<string, number> = {
  KeyQ: 0x10,
  KeyW: 0x11,
  KeyE: 0x12,
  KeyR: 0x13,
  KeyT: 0x14,
  KeyY: 0x15,
  KeyU: 0x16,
  KeyI: 0x17,
  KeyO: 0x18,
  KeyP: 0x19,
  KeyA: 0x1e,
  KeyS: 0x1f,
  KeyD: 0x20,
  KeyF: 0x21,
  KeyG: 0x22,
  KeyH: 0x23,
  KeyJ: 0x24,
  KeyK: 0x25,
  KeyL: 0x26,
  KeyZ: 0x2c,
  KeyX: 0x2d,
  KeyC: 0x2e,
  KeyV: 0x2f,
  KeyB: 0x30,
  KeyN: 0x31,
  KeyM: 0x32,
  Digit1: 0x02,
  Digit2: 0x03,
  Digit3: 0x04,
  Digit4: 0x05,
  Digit5: 0x06,
  Digit6: 0x07,
  Digit7: 0x08,
  Digit8: 0x09,
  Digit9: 0x0a,
  Digit0: 0x0b,
  F1: 0x3b,
  F2: 0x3c,
  F3: 0x3d,
  F4: 0x3e,
  F5: 0x3f,
  F6: 0x40,
  F7: 0x41,
  F8: 0x42,
  F9: 0x43,
  F10: 0x44,
  F11: 0x57,
  F12: 0x58,
};

export const KEYCODES: Readonly<Record<string, number>> = ROWS;

export type ModifierName = 'shift' | 'ctrl' | 'alt';

/** Left and right keycodes for each modifier. */
export const MODIFIER_KEYCODES: Readonly<Record<ModifierName, readonly number[]>> = {
  shift: [0x2a, 0x36],
  ctrl: [0x1d, 0x0e1d],
  alt: [0x38, 0x0e38],
};

export function keycodeFor(code: string): number | undefined {
  return KEYCODES[code];
}

export function isModifierKeycode(keycode: number): boolean {
  return Object.values(MODIFIER_KEYCODES).some((codes) => codes.includes(keycode));
}

/** Electron accelerator main-key name for a code, used by the registration probe. */
export function acceleratorKey(code: string): string | undefined {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  return /^F([1-9]|1[0-2])$/.test(code) ? code : undefined;
}
