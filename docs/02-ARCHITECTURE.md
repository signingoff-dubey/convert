# 02 — Architecture

## 1. Stack (decided)

| Concern | Choice | Notes |
|---|---|---|
| Shell | Electron (latest stable at audit time) | Windows 10 22H2+ and 11, x64 first |
| Build | electron-vite | One config for main, preload, renderers |
| UI | React 18 + TypeScript strict | |
| State | Zustand | Per-window stores; main process owns the truth |
| Styling | Tailwind + CSS variables | Theme tokens in `docs/03` |
| Settings store | electron-store + zod validation | `%APPDATA%/Convert/settings.json` |
| Global hooks | `uiohook-napi` | Mouse and key events. Suppression support must be verified in Phase 0. |
| Win32 calls | `koffi` | `WindowFromPoint`, `GetAncestor`, `GetClassNameW`, `GetAsyncKeyState`, etc. |
| Packaging | electron-builder (NSIS, per-user install) | Per-user avoids UAC |
| Tests | Vitest (unit), Playwright for Electron (UI smoke) | |

Why Electron over Tauri: faster to ship with React, and the team already knows the stack. The cost is idle RAM, which is why the performance budget in `AGENTS.md` exists. Revisit only if the budget can't be met.

## 2. Process model

```
Main process (Node)
 ├─ TriggerEngine      hooks → state machine → open/close wheel
 ├─ OverlayManager     owns the single pre-created overlay window
 ├─ JobQueue           runs conversions in worker threads / child processes
 ├─ SettingsService    load, validate, migrate, broadcast changes
 ├─ ConflictProbe      checks combos (see docs/04)
 ├─ TrayService, AutostartService, ToastManager, FloatShelf
 └─ native/            koffi + uiohook wrappers behind interfaces

Renderer: overlay     (hidden BrowserWindow, wheel UI + drop handling)
Renderer: settings    (created on demand, destroyed on close)
Renderer: toast       (small transparent window, shown on demand)
Renderer: toolwin     (Trim / Split / Merge, on demand)
Renderer: float       (Float shelf, on demand)
```

Renderers never touch Node or the filesystem. They call a typed preload API.

## 3. Folder layout

```
convert/
  AGENTS.md  CLAUDE.md  README.md
  docs/
  src/
    main/
      index.ts
      trigger/        state-machine.ts  hooks.ts  gating.ts  keymap.ts
      overlay/        overlay-window.ts  geometry.ts  dpi.ts
      jobs/           queue.ts  worker.ts  naming.ts  cancel.ts
      engines/        image.ts  av.ts  pdf.ts  docs.ts  sheets.ts  subs.ts  archive.ts  meta.ts
      settings/       schema.ts  store.ts  migrate.ts  conflicts.ts
      native/         win32.ts  hooks-iface.ts  shell.ts
      services/       tray.ts  autostart.ts  toast.ts  float.ts  terminal.ts
    preload/          overlay.ts  settings.ts  toast.ts  common.ts
    renderer/
      overlay/        Wheel.tsx  wedges.ts  hit-test.ts
      settings/       App.tsx  pages/  components/
      toast/  toolwin/  float/
      theme/          tokens.css  themes.ts  accent.ts
    shared/           ipc.ts  types.ts  strings.ts  formats.ts
  tests/
  resources/          icons, bundled engine binaries (ffmpeg, 7za, exiftool)
```

## 4. Trigger engine

### 4.1 State machine (pure, unit-tested, no Electron imports)

```
IDLE
  leftDown  [source allowed]            → ARMED {origin, t0}
ARMED
  move > 6 px (physical)                → DRAGGING
  leftUp                                → IDLE
DRAGGING
  combo(W)  [wheel W enabled]           → WHEEL_OPEN {W}   (open overlay)
  leftUp                                → IDLE
WHEEL_OPEN {W}
  combo(W2) [W2 ≠ W]                    → WHEEL_OPEN {W2}  (switch in place)
  drop on wedge                         → RUNNING → IDLE
  Esc | drop in hole | drop outside     → IDLE (close overlay)
  leftUp  [cursor not over overlay]     → IDLE (close overlay)
```

Hard rules:

- A combo is only evaluated in `DRAGGING` or `WHEEL_OPEN`. In every other state, key events pass through untouched. Typing `Shift+C` in Notepad must never do anything.
- The engine must have a **watchdog**: if no mouse event arrives for 30 s in any non-IDLE state, reset to IDLE and close the overlay. This prevents a stuck overlay if a `leftUp` is lost.
- `Pause` in the tray removes the hooks entirely.

### 4.2 Source gating ("Limit to Explorer and Desktop")

At `leftDown`, use koffi to call `WindowFromPoint` then `GetAncestor(GA_ROOT)` then `GetClassNameW`. Allowed root classes (extendable list in settings):

- `CabinetWClass` (Explorer window, including Windows 11 tabs)
- `Progman` and `WorkerW` (Desktop)

Anything else → stay IDLE. This is what keeps the hook quiet while the user drags text, selects in an editor, or plays a game.

[Guessing] Windows 11's Explorer may host content in child windows with different classes. Phase 0 must verify the root-class approach on Win10 and Win11 and record the findings.

### 4.3 Key detection

- Settings store combos as `{ modifiers: ('shift'|'ctrl'|'alt')[], code: string }`, where `code` is a `KeyboardEvent.code` value such as `KeyC`. This is layout-independent.
- `keymap.ts` maps `code` to uiohook keycodes. Unit-test every mapped key.
- Compare against the hook's live modifier state, not a cached one. On a mismatch, re-read via `GetAsyncKeyState`.
- **Suppression:** if the hook library can consume events on Windows, consume the combo's non-modifier key (and only that) while in `DRAGGING` or `WHEEL_OPEN`, so the source app never sees it. If it can't, fall back to a `WH_KEYBOARD_LL` hook installed through koffi, or accept pass-through. The OLE drag loop in the source app is [Likely] to ignore stray keys anyway. Phase 0 must test and record which holds.

## 5. Overlay window

Pre-create one hidden `BrowserWindow` at startup so the wheel appears in under 80 ms.

```ts
new BrowserWindow({
  show: false, frame: false, transparent: true, resizable: false,
  skipTaskbar: true, focusable: false, hasShadow: false,
  alwaysOnTop: true,            // then setAlwaysOnTop(true, 'screen-saver')
  webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false }
})
```

- Show with `showInactive()` so the source app keeps focus and the drag isn't disturbed.
- Size is wheel diameter plus padding, centered on the cursor, clamped to the monitor's work area.
- **DPI:** uiohook reports physical pixels. Convert with `screen.screenToDipPoint` per monitor before positioning. Unit-test the math for 100%, 125%, 150%, and mixed-DPI setups.
- The window must not intercept the mouse before the drag reaches it; do **not** call `setIgnoreMouseEvents(true)`.

## 6. Drop pipeline (the riskiest part)

1. The wheel is plain React plus SVG for painting. Hit-testing is **angle math** (`atan2` from the wheel center to the pointer, and a radius check for the hole), not per-element DOM events. This avoids flicker from enter/leave events.
2. The container listens for `dragenter`, `dragover`, and `drop`. In `dragover`, call `preventDefault()` and set `dataTransfer.dropEffect = 'copy'`. This is a safety rule: the drop must **never** return a Move effect, or the source app may delete the original.
3. On `drop`, read files with `webUtils.getPathForFile(file)` (preload) and send the paths to main over IPC.
4. Main re-validates every path: it exists, it's a regular file or directory, and it isn't under a protected system location. Then it enqueues a job.

**Contingency (named in advance):** if a window shown mid-drag does not receive OLE drops reliably, build a small native addon (Rust via napi-rs, or C++) that registers an `IDropTarget` on the overlay's HWND and forwards `CF_HDROP` paths. Phase 0 decides this. Don't write the addon unless the spike fails.

## 7. IPC

All channels are declared once in `src/shared/ipc.ts` with zod schemas for the payload and the response. No ad-hoc `ipcRenderer.send` strings anywhere else.

| Channel | Direction | Payload |
|---|---|---|
| `overlay:open` | main → overlay | `{ wheelId, items, theme, anchor }` |
| `overlay:drop` | overlay → main | `{ wheelId, wedgeId, paths }` |
| `overlay:cancel` | overlay → main | `{}` |
| `settings:get` / `settings:set` | settings ↔ main | full or partial settings |
| `settings:changed` | main → all | new settings |
| `combo:validate` | settings → main | `{ combo, wheelId }` → `{ status, messages }` |
| `combo:test:event` | main → settings | detected combo, while test mode is on |
| `job:progress` / `job:done` / `job:error` | main → toast | job id, percent, result |

## 8. Security

- CSP on every renderer: `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'none'`.
- Block all navigation and `window.open` (`setWindowOpenHandler` returns `deny`).
- Bundled binaries (ffmpeg, 7za, exiftool) are invoked with an **argument array**, never through a shell string. File names are never interpolated into a command line.
- Reject paths that fail normalization or contain device-name tricks (`\\.\`, `\\?\` prefixes). Don't operate inside `C:\Windows` or `Program Files`.
- UIPI note: hooks and drags can't cross integrity levels. When Explorer runs elevated, Convert (not elevated) won't see it. Document this in Settings → Advanced; never auto-elevate.

## 9. Risks and contingencies

| Risk | Likelihood | Contingency |
|---|---|---|
| Mid-drag overlay doesn't receive drops | [Guessing] medium | Native `IDropTarget` addon (§6) |
| Hook library can't suppress keys | [Likely] | koffi `WH_KEYBOARD_LL`, or pass-through |
| Win11 Explorer class check fails | [Guessing] medium | Use `UIAutomation` to confirm a list-item under the cursor |
| Idle RAM over budget | [Likely] | Lazy-create the toast/float windows; trim preloads; revisit Tauri |
| HEIC input unsupported in prebuilt sharp | [Likely] | `heic-convert` (WASM) for decode, then sharp |
| AV software flags the global hook | [Likely] some | Sign the build; document in README; no workaround in code |

## 10. Future (not v1)

- **Android:** drag-between-apps doesn't exist. Plan a separate app that is a share-sheet target plus an optional floating bubble. Keep `src/shared/formats.ts` and the engine interfaces free of Electron imports so the format map and naming logic can be reused.
- **Explorer-selection mode:** press a combo with files selected (no drag) and open the wheel at the cursor, reading the selection through `IShellWindows`.
- **Shell extension:** "Convert to..." in the right-click menu.
