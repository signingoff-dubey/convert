import { describe, expect, it } from 'vitest';
import { recoverSettings } from '../src/main/settings/migrate';
import { Combo, Settings, defaultSettings } from '../src/main/settings/schema';

const now = new Date('2026-10-29T13:00:00.000Z');

describe('settings', () => {
  it('has the documented defaults', () => {
    const s = defaultSettings();
    expect(s.triggers.convert).toEqual({ modifiers: ['shift'], code: 'KeyC' });
    expect(s.general.allowedWindowClasses).toEqual(['CabinetWClass', 'Progman', 'WorkerW']);
    expect(s.output.recycleOriginal).toBe(false);
    expect(s.appearance.accent).toBe('#7C5CFF');
  });
  it('rejects bad combos and out-of-range values', () => {
    expect(Combo.safeParse({ modifiers: [], code: 'KeyC' }).success).toBe(false);
    expect(Combo.safeParse({ modifiers: ['shift'], code: 'Enter' }).success).toBe(false);
    expect(
      Settings.safeParse({
        ...defaultSettings(),
        output: { ...defaultSettings().output, toastSeconds: 99 },
      }).success,
    ).toBe(false);
  });
  it('loads defaults silently when there is no file', () => {
    expect(recoverSettings(null, now)).toEqual({ settings: defaultSettings() });
  });
  it('keeps a valid file untouched', () => {
    const s = {
      ...defaultSettings(),
      appearance: { ...defaultSettings().appearance, theme: 'paper' as const },
    };
    expect(recoverSettings(JSON.stringify(s), now)).toEqual({ settings: s });
  });
  it('backs up corrupt and invalid files instead of deleting them', () => {
    for (const text of ['{not json', '{"version":2}']) {
      const r = recoverSettings(text, now);
      expect(r.settings).toEqual(defaultSettings());
      expect(r.backup?.content).toBe(text);
      expect(r.backup?.fileName).toBe('settings.bad-2026-10-29T13-00-00-000Z.json');
    }
  });
});
