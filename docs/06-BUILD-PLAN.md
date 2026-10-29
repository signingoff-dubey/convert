# 06 — Build Plan

One phase at a time. At the end of each: run the acceptance checks, write a short report in `docs/PROGRESS.md`, commit, then **stop and wait** for `continue`.

---

## Phase 0 — Audit and spike (gate)

**Goal:** prove the risky assumptions before building anything. **Only `docs/AUDIT.md` may be written, plus a throwaway `spike/` folder that is deleted at the end.**

Tasks:

1. Record the environment: Windows build, Node, npm, Electron version, whether it's a real Windows machine, display scaling, and number of monitors.
2. Dependency audit: for each library in `docs/02` and `docs/05`, record the latest stable version, license, whether it ships Windows x64 prebuilds, and install size. Flag anything AGPL, GPL, or unmaintained.
3. **Spike A: drop onto a mid-drag overlay.** Minimal Electron app with a hidden transparent always-on-top window and `uiohook-napi`. While dragging a file from Explorer, press `Shift+C`; show the window with `showInactive()` at the cursor; drop the file on it. Record: does the window appear without stealing focus, does `dragover` fire, does `drop` fire, does `webUtils.getPathForFile` return a real path, is the source file untouched?
4. **Spike B: hook behavior.** Does `uiohook-napi` see mouse-up and key events during an OLE drag? Can it suppress keys? If not, can a koffi `WH_KEYBOARD_LL` hook? Record results.
5. **Spike C: gating.** Using koffi, read the window class under the cursor on mouse-down for: Win10 Explorer, Win11 Explorer (two tabs), the Desktop, a browser, Notepad. Record the root class names.
6. **Spike D: key interactions.** Run through the table in `docs/04` §5, rows 1, 2, 9, 10.
7. **Spike E: probe.** Implement the `globalShortcut` probe; verify it reports `taken` when a small script has registered the combo.
8. Measure: time from keydown to overlay visible; idle RAM and CPU of the spike.

**Deliverable:** `docs/AUDIT.md` with a table of every spike (PASS / FAIL / PARTIAL, evidence, what was observed), a go/no-go on each contingency in `docs/02` §9, and a list of any `DEVIATION`s.

**Gate:** wait for `proceed`.

---

## Phase 1 — Skeleton, settings, themes

Build:

- electron-vite project, strict TS, ESLint, Prettier, Vitest.
- `SettingsService` (schema from `docs/03`, migration stub, atomic writes, corrupt-file backup).
- Tray icon, pause/resume, quit, single-instance lock, autostart service.
- Settings window with **all pages** from `docs/03` §2. Pages that depend on later phases (Wheels, Engines) show real UI but placeholder data.
- All themes, accents, wheel styles, `WheelPreview` with mock wedges.
- Component library from `docs/03` §5.

Acceptance:

- Theme and accent switch live, with no restart or flash.
- Contrast unit test passes for every theme × preset accent.
- Corrupt settings file recovers.
- Start with Windows toggles the Run key (verify with `reg query`).
- Idle RAM with settings closed is under budget.

---

## Phase 2 — Trigger engine and overlay

Build:

- Pure state machine with tests (`docs/02` §4.1).
- Hooks wrapper, gating by window class, `keymap.ts`, watchdog.
- Overlay window, geometry and DPI math, wheel rendering with angle hit-testing.
- Drop pipeline: preload `getPathForFile`, IPC, main-side path validation.
- A **dummy job** for each wedge that only logs, so the interaction can be tested before real engines exist.
- Triggers page: `ComboRecorder`, validation, probe, test panel (`docs/04`).

Acceptance:

- Wheel visible under 80 ms (median of 20 tries) after the combo.
- `Shift+C/T/A` open the correct wheel; pressing another combo switches; Esc and drop-outside cancel.
- Nothing happens when typing the combos outside a drag.
- Source file unchanged after every drop test.
- Changing a combo in Settings takes effect immediately.
- All rows in `docs/04` §5 tested and logged.

---

## Phase 3 — Images and PDF

Build: `formats.ts`, `naming.ts`, job queue, image engine (incl. HEIC decode), images → PDF, PDF → PNG/JPG, Compress, Resize, Rotate, Flip, Strip metadata, toast manager (progress, Show in folder, Undo, Cancel).

Acceptance: golden-file tests pass; collision naming tests pass; cancel leaves no temp files; Undo deletes only the output.

---

## Phase 4 — Audio, video, and Actions

Build: ffmpeg integration (progress parsing, cancel), audio and video conversions, Compress, Extract audio, Trim tool window, Normalize; the six Actions (Copy, Move with picker, Copy Path, Terminal, Float shelf, Reveal).

Acceptance: a 1-minute test video converts with progress; cancel kills ffmpeg; Move is the only action that removes a source; Terminal opens at the right folder with spaces and unicode in the path.

---

## Phase 5 — Documents, sheets, subtitles, archives, remaining tools

Build: docx/md/txt/html conversions, xlsx/csv/tsv, srt/vtt, archives, Split and Merge PDF tool windows, Wheels page fully wired (order and enable/disable persist and affect the overlay), Engines page with live status, Office engine detection.

Acceptance: format matrix in `docs/05` §3 passes for every ✔ cell; wedge hidden when its engine is missing.

---

## Phase 6 — Polish, packaging, release

Build: onboarding, error text pass, log folder, import/export settings, installer (NSIS, per-user), app icon set, code-signing hook (documented, not required to run), `LICENSES.md` generated and shown in About, README screenshots.

Acceptance: clean install on a fresh Windows 10 VM and a Windows 11 machine; autostart works after reboot; uninstall removes the Run key and leaves user files alone; the offline-guarantee test passes; the full QA matrix below passes.

---

## QA matrix (run at Phase 2 and Phase 6)

| Source | Win10 | Win11 |
|---|---|---|
| Explorer, single file | ☐ | ☐ |
| Explorer, multiple files, same type | ☐ | ☐ |
| Explorer, mixed types | ☐ | ☐ |
| Explorer, folder | ☐ | ☐ |
| Explorer second tab | n/a | ☐ |
| Desktop icon | ☐ | ☐ |
| File with spaces, unicode, and 200+ char path | ☐ | ☐ |
| Network share file | ☐ | ☐ |
| OneDrive placeholder file (cloud-only) | ☐ | ☐ |
| Browser download bar item | ☐ | ☐ |
| Virtual file (zip view, email attachment) | ☐ | ☐ |
| Dual monitor, mixed DPI | ☐ | ☐ |
| 125% and 150% scaling | ☐ | ☐ |
| Elevated Explorer (expected: no activation) | ☐ | ☐ |
| Pause from tray, then drag | ☐ | ☐ |
| Combo typed in Notepad and a browser (expected: nothing) | ☐ | ☐ |

For each cell, the tester notes: wheel appeared, drop worked, source intact, output correct.

---

## Definition of done (v1)

- All phases accepted.
- All ✔ cells in the format matrix work.
- Performance budget met and measured in `docs/PROGRESS.md`.
- No network access, verified by the offline test and a firewall block test.
- No source file was lost in any test run.
- `docs/DECISIONS.md` lists every deviation with its evidence.
