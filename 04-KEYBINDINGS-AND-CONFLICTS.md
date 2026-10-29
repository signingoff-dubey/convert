# 04 — Key Bindings and Conflict Checking

## 1. Defaults

| Wheel | Default | Mnemonic |
|---|---|---|
| Convert | `Shift+C` | **C**onvert |
| Tools | `Shift+T` | **T**ools |
| Actions | `Shift+A` | **A**ctions |

Why these:

- You press them with the left hand while the right hand holds the drag.
- They need Shift, so a stray letter never opens a wheel.
- They are letters, not Shift alone, because Shift during a drag already means "move" in Explorer (Ctrl is "copy", Alt is "create shortcut"). Convert never uses a bare modifier as a trigger.
- No default involves Alt or Win. `Alt+Shift` switches the keyboard layout, and Win combos are reserved by Windows.

Combos are stored by physical key (`KeyboardEvent.code`), so `Shift+C` is the same key on QWERTY, AZERTY, and Dvorak.

## 2. Why conflicts are mostly contained

A combo is only evaluated while the state machine is `DRAGGING` or `WHEEL_OPEN` (see `docs/02` §4.1), meaning the left mouse button is held after moving over a file in an allowed window. Outside a drag, Convert ignores keyboard input entirely. So `Shift+C` in Notepad, a browser, or a game does nothing.

The remaining conflicts are:

1. **Another app has registered the same combo system-wide** and may also fire during your drag.
2. **The source app reacts to the key during a drag.**
3. **Windows or an IME reserves the combo.**

## 3. Validation rules (enforced in main, mirrored in the recorder UI)

A combo is **Blocked** (cannot be saved) if:

- It has no modifier, or more than two.
- It uses the Win key.
- It uses a non-letter/digit/F-key as the main key (Enter, Esc, Tab, Space, arrows, Backspace, Delete, and so on).
- Its main key is a modifier.
- It matches one of the OS-reserved or critical combos below.
- It duplicates another Convert wheel's combo.

**Reserved denylist (exact combos):**

```
Ctrl+Alt+Delete   Ctrl+Shift+Esc   Alt+F4        Alt+Tab        Alt+Esc
Ctrl+C  Ctrl+V  Ctrl+X  Ctrl+Z  Ctrl+Y  Ctrl+A  Ctrl+S  Ctrl+P  Ctrl+F  Ctrl+W
Shift+F10         Shift+Delete     Alt+Shift (layout switch, modifier-only)
Ctrl+Shift+N      Ctrl+Shift+T     Ctrl+Shift+W   (very common app/browser actions)
```

A combo gets a **Warning** (can be saved) if:

- Its main key is F1–F12 (apps use these heavily).
- It includes Alt (Alt+Shift conflicts with layout switching when the keys are pressed in the wrong order; Alt also opens menus).
- The registration probe (§4) finds it already registered by another program.

## 4. The registration probe

Windows lets only one program own a `RegisterHotKey` combo. Electron's `globalShortcut.register()` returns `false` when the combo is taken. Convert uses this purely as a **detector**:

```ts
function probe(accelerator: string): 'free' | 'taken' {
  const ok = globalShortcut.register(accelerator, () => {});
  if (ok) { globalShortcut.unregister(accelerator); return 'free'; }
  return 'taken';
}
```

Rules:

- Run the probe at app start (in the background, after boot), whenever a combo changes, and when the user presses **Re-check conflicts**.
- Never leave a probe registration behind. Wrap in try/finally. Unit test with a mock.
- The probe is **advisory**. Result `taken` shows: "Another app has registered `Shift+C` system-wide. It may also react while you use Convert. Pick a different combo or continue anyway."
- [Certain] The probe can't see low-level hooks, AutoHotkey scripts that use hooks, or game input layers. It only finds `RegisterHotKey` owners. The UI must say so ("Checked against registered system hotkeys. Some apps can't be detected.").
- The probe needs the main key to be representable as an Electron accelerator. If it isn't, show "Can't check this key" and treat it as a Warning.

## 5. Known interactions to verify on real machines

These come from static reasoning. [Likely] each is accurate, but Phase 0 and Phase 2 must test them and record results in `docs/AUDIT.md`.

| # | Interaction | Expected | Test |
|---|---|---|---|
| 1 | Shift held during an Explorer drag changes the cursor to "Move" | Overlay's drop target forces `dropEffect = 'copy'`; source file is never moved or deleted | Drop on every wedge type; assert the source still exists and is unchanged |
| 2 | Letter keys pressed during an Explorer drag | Ignored by the drag loop | Press Shift+C mid-drag with suppression disabled; confirm nothing in Explorer changes (no type-ahead selection, no rename) |
| 3 | Shift pressed 5 times in a row opens Sticky Keys | Not triggered by hold-Shift-tap-letter | Document in the onboarding: hold Shift once, tap the letter |
| 4 | Input-method editors (Chinese, Japanese, Korean) treat a bare Shift tap as a mode toggle | Holding Shift while pressing a letter does not toggle | Test with Microsoft Pinyin if available; otherwise mark untested |
| 5 | Alt+Shift layout switch | Not part of any default combo | Verify defaults with a second keyboard layout installed |
| 6 | Another app registered the same combo | Probe warns | Register `Shift+C` from a small test script, then run Re-check |
| 7 | Elevated Explorer or elevated source app | Convert never sees the drag (UIPI) | Document; don't try to work around |
| 8 | Windows 11 Explorer tabs and the Desktop | Gating by window class works | Drag from a tab, a second tab, and the Desktop |
| 9 | Fast user typing in Explorer's rename box after a drag | No stuck wheel; watchdog resets | Start a drag, press Esc, type immediately; confirm normal typing |
| 10 | Key repeat while holding the combo | One open event only | Hold Shift+C for 2 s; assert a single `overlay:open` |

## 6. Recorder UX (`ComboRecorder` component)

1. Idle: shows the combo as keycaps (`Shift` `C`) and a small "Change" button.
2. Click: field says "Press the new combo... (Esc to cancel)". Focus is trapped in the field.
3. The renderer listens to `keydown`, reads `event.code` and the modifier flags, and ignores bare modifiers until a main key arrives.
4. On a valid press, ask main `combo:validate`. Show status inline:
   - **Blocked:** red text with the reason; the old combo stays.
   - **Warning:** amber text with the reason plus a "Use anyway" button.
   - **OK:** saved immediately with a green check.
5. `Backspace` while recording resets that wheel to its default. `Esc` cancels.
6. Show a "Reset to defaults" link under the three rows.

### Test panel

A "Test combos" toggle on the Triggers page. While on and the settings window is open:

- Main starts reporting detected combos, even outside a drag, over `combo:test:event`.
- The panel shows "Detected: Shift+C → Convert" with the matching row flashing.
- This is **only** active while the toggle is on and the page is visible. It turns itself off on page leave or window close, and never logs key content to disk.

## 7. Privacy

The hook looks at keys only to match configured combos and only during a drag. No keystroke is stored, logged, or sent anywhere. The log must never contain key codes other than the three matched combos, and only at `debug` level.

## 8. Unit tests required

- Combo parsing, normalization, and equality
- Every denylist rule, duplicate detection, and Blocked/Warning/OK classification
- `keymap.ts` for every allowed `code`
- Probe wrapper with a mocked `globalShortcut` (free, taken, throws)
- State machine: combos ignored in IDLE and ARMED, accepted in DRAGGING, switch wheels in WHEEL_OPEN, key repeat de-bounced
