import { describe, expect, it, vi } from 'vitest';
import {
  comboEquals,
  formatCombo,
  isReserved,
  probe,
  validateCombo,
  type RecordedCombo,
} from '../src/main/settings/conflicts';
import {
  KEYCODES,
  acceleratorKey,
  isModifierKeycode,
  keycodeFor,
} from '../src/main/trigger/keymap';

const c = (modifiers: RecordedCombo['modifiers'], code: string): RecordedCombo => ({
  modifiers,
  code,
});

describe('combo basics', () => {
  it('normalizes modifier order for equality and display', () => {
    expect(comboEquals(c(['shift', 'ctrl'], 'KeyK'), c(['ctrl', 'shift'], 'KeyK'))).toBe(true);
    expect(formatCombo(c(['shift'], 'KeyC'))).toBe('Shift+C');
  });
});

describe('validateCombo', () => {
  it('accepts the three defaults', () => {
    for (const code of ['KeyC', 'KeyT', 'KeyA']) {
      expect(validateCombo(c(['shift'], code), [])).toEqual({ status: 'ok', messages: [] });
    }
  });
  it('blocks structural problems', () => {
    expect(validateCombo(c([], 'KeyC'), []).status).toBe('blocked');
    expect(validateCombo(c(['shift', 'ctrl', 'alt'], 'KeyC'), []).status).toBe('blocked');
    expect(validateCombo(c(['meta'], 'KeyC'), []).status).toBe('blocked');
    expect(validateCombo(c(['shift'], 'Enter'), []).status).toBe('blocked');
    expect(validateCombo(c(['shift'], 'Space'), []).status).toBe('blocked');
    expect(validateCombo(c(['ctrl'], 'ShiftLeft'), []).status).toBe('blocked');
  });
  it('blocks every reserved combo', () => {
    expect(isReserved(c(['ctrl'], 'KeyC'))).toBe(true);
    expect(isReserved(c(['shift', 'ctrl'], 'KeyN'))).toBe(true);
    expect(validateCombo(c(['ctrl', 'shift'], 'KeyT'), []).status).toBe('blocked');
    expect(validateCombo(c(['alt'], 'F4'), []).status).toBe('blocked');
    expect(validateCombo(c(['ctrl'], 'KeyQ'), []).status).toBe('ok');
  });
  it('blocks duplicates of the other wheels', () => {
    const v = validateCombo(c(['shift'], 'KeyC'), [c(['shift'], 'KeyC')]);
    expect(v.status).toBe('blocked');
  });
  it('warns for F-keys, Alt, and probe results', () => {
    expect(validateCombo(c(['shift'], 'F5'), []).status).toBe('warning');
    expect(validateCombo(c(['alt', 'shift'], 'KeyJ'), []).status).toBe('warning');
    expect(validateCombo(c(['shift'], 'KeyJ'), [], 'taken')).toMatchObject({ status: 'warning' });
    expect(validateCombo(c(['shift'], 'KeyJ'), [], 'unknown').status).toBe('warning');
    expect(validateCombo(c(['shift'], 'KeyJ'), [], 'free').status).toBe('ok');
  });
});

describe('probe', () => {
  it('reports free and always unregisters', () => {
    const api = { register: vi.fn(() => true), unregister: vi.fn() };
    expect(probe(c(['shift'], 'KeyC'), api)).toBe('free');
    expect(api.register).toHaveBeenCalledWith('Shift+C', expect.any(Function));
    expect(api.unregister).toHaveBeenCalledWith('Shift+C');
  });
  it('reports taken without unregistering what it does not own', () => {
    const api = { register: vi.fn(() => false), unregister: vi.fn() };
    expect(probe(c(['shift'], 'KeyC'), api)).toBe('taken');
    expect(api.unregister).not.toHaveBeenCalled();
  });
  it('reports unknown when registration throws or the key has no accelerator', () => {
    const throwing = {
      register: vi.fn(() => {
        throw new Error('x');
      }),
      unregister: vi.fn(),
    };
    expect(probe(c(['shift'], 'KeyC'), throwing)).toBe('unknown');
    expect(probe(c(['shift'], 'Enter'), throwing)).toBe('unknown');
  });
});

describe('keymap', () => {
  const codes = [
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `Key${l}`),
    ...'0123456789'.split('').map((d) => `Digit${d}`),
    ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  ];
  it('maps every allowed code to a unique non-modifier keycode', () => {
    const seen = new Set<number>();
    for (const code of codes) {
      const k = keycodeFor(code);
      expect(k, code).toBeDefined();
      expect(isModifierKeycode(k as number)).toBe(false);
      seen.add(k as number);
      expect(acceleratorKey(code), code).toBeDefined();
    }
    expect(seen.size).toBe(codes.length);
    expect(Object.keys(KEYCODES)).toHaveLength(codes.length);
  });
  it('knows the modifier keycodes', () => {
    expect(isModifierKeycode(0x2a)).toBe(true);
    expect(keycodeFor('Enter')).toBeUndefined();
  });
});
