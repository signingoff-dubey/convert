# Convert

**Drag a file. Tap a key. Drop on a wheel.**
An offline, always-running file converter and file-tools launcher for Windows.

Inspired by the interaction idea of Tangerine for Mac. Convert shares no code, name, icons, or assets with it.

---

## What it does

1. You start dragging a file or folder in Explorer or on the Desktop.
2. While still holding the mouse button, you press a key combo (default `Shift+C`, `Shift+T`, or `Shift+A`).
3. A radial wheel opens under your cursor.
4. You drop the file on a wedge. The job runs locally. A toast tells you when it's done.

Nothing is ever uploaded. There is no network code in the app.

## The three wheels

| Wheel | Default combo | Purpose |
|---|---|---|
| Convert | `Shift+C` | Change format (PNG, MP3, PDF, ...) |
| Tools | `Shift+T` | Compress, resize, strip metadata, ... |
| Actions | `Shift+A` | Copy, Move, Copy Path, Terminal, Float, Reveal |

All three combos are configurable in Settings, with a conflict checker. See `docs/04-KEYBINDINGS-AND-CONFLICTS.md`.

## Stack (decided)

Electron + React + TypeScript (strict) + Vite (electron-vite) + Zustand + Tailwind with CSS-variable theming. Native pieces: `uiohook-napi` for global hooks, `koffi` for Win32 calls. Engines: ffmpeg, sharp, pdf-lib, pdfjs, exiftool, 7-Zip.

## Docs index (read in this order)

| # | File | What it holds |
|---|---|---|
| - | `AGENTS.md` | Rules for the AI agent. Read first. |
| 1 | `docs/01-PRODUCT-SPEC.md` | UX, wheels, behavior, edge cases |
| 2 | `docs/02-ARCHITECTURE.md` | Process model, trigger engine, overlay, IPC, risks |
| 3 | `docs/03-SETTINGS-AND-THEMES.md` | Settings window, schema, themes, appearance |
| 4 | `docs/04-KEYBINDINGS-AND-CONFLICTS.md` | Default combos, validation, conflict probing |
| 5 | `docs/05-CONVERSION-ENGINE.md` | Format matrix, engines, job queue, output naming |
| 6 | `docs/06-BUILD-PLAN.md` | Phases, acceptance criteria, QA matrix |

## How to hand this to an agent

Put this folder at the root of an empty repo (so `AGENTS.md` and `docs/` sit at the top), open it on a **Windows** machine, and paste:

```
Read AGENTS.md, then every file in docs/ in order.
Do Phase 0 only (audit and spike).
Do not create or modify any file except docs/AUDIT.md until you have written the
audit report and I reply "proceed".
```

The agent must run on real Windows 10 or 11. Global hooks and drag-and-drop cannot be tested in WSL, Linux, or a container.

## Non-goals (v1)

- macOS or Linux builds
- Cloud anything: accounts, sync, telemetry, auto-upload
- Android (planned later; see the "Future" section of `docs/02-ARCHITECTURE.md`)
- Full parity with Tangerine's 275 conversions. v1 targets the common formats listed in `docs/05-CONVERSION-ENGINE.md`.
