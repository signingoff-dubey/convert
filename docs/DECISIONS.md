# Decisions and deviations

Format per `AGENTS.md`: what, why, evidence, what was done instead. Items marked **needs Windows** could not be verified where this was built.

## DEVIATION-1: Built in a Linux container; Phase 0 spikes were not run

- **What:** `AGENTS.md` says that on Linux or in a container the agent must say so and stop, because hooks and drag-and-drop cannot be verified there.
- **Why it went ahead:** the owner explicitly asked for the whole app to be built in this environment ("do everything possible here").
- **Evidence:** the session ran on Linux 6.18 in a cloud container with no Windows machine; `process.platform` is `linux`.
- **What was done instead:** everything that touches Windows sits behind interfaces (`src/main/native/`), with an inert fallback off Windows. All logic that does not need Windows is unit-tested, and the app was run under a virtual display on Linux to check the windows, IPC and end-to-end jobs. Spikes A to E are recorded as NOT RUN in `docs/AUDIT.md`, with a checklist in `docs/WINDOWS-TEST-PLAN.md`.
- **Risk:** the core assumption (a window shown mid-drag receives the drop) is untested. If it fails, the named contingency is a native `IDropTarget` addon (`docs/02` section 6).

## DEVIATION-2: Phase gates skipped

The build plan says to stop after each phase and wait for `continue`. All phases were built in one pass at the owner's request. Acceptance checks that need Windows are listed as open in `docs/PROGRESS.md`.

## DEVIATION-3: v2 tools built in v1

`docs/01` section 4.2 lists Crop, Redact, Annotate, Add background, Edit and Edit metadata as "do not build in v1". The owner supplied screenshots of the reference product and asked for all features shown, so they were built. Rotate, Flip, Resize and Strip metadata live inside Edit, Compress and Metadata, as in the reference. Collage and combined multi-image PDF were added from the same screenshots.

## DEVIATION-4: Wheels hold up to 8 wedges

`docs/01` says at most 7. The PDF wheel has 8 targets (DOCX, PPTX, XLSX, JPG, PNG, EPUB, TXT, MD) and audio and video have 8 once their own format is not removed. Hit-testing and drawing work for any count; a test asserts no real source file produces more than 8.

## DEVIATION-5: Own settings store instead of electron-store

`recoverSettings` needs raw file text to back up a corrupt file before defaults load, which electron-store does not expose. `SettingsService` does debounced atomic writes and keeps `settings.bad-<time>.json`. Behavior matches `docs/03` section 3. Tested.

## DEVIATION-6: One sandboxed preload

electron-vite split the five preload scripts into shared chunks, and a sandboxed preload cannot `require` a sibling file. There is now one `preload/index.js`; it reads `--convert-page=<name>` from the launch arguments and exposes only that window's allow-listed channels (`src/shared/access.ts`). Main checks the same table again on every call.

## DEVIATION-7: No key suppression (spec contingency)

`uiohook-napi` cannot consume events. Combos pass through to the source app, which is the pass-through fallback `docs/02` section 4.3 allows. A `WH_KEYBOARD_LL` hook through koffi was not written. **Needs Windows:** test row 2 in `docs/04` section 5 (a letter pressed mid-drag must not change anything in Explorer).

## DEVIATION-8: Library versions

React 19 and Tailwind 4 were used because `AGENTS.md` says to use the latest stable versions, although `docs/02` names React 18. Versions are in `package.json` and `docs/AUDIT.md`.

## DEVIATION-9: Wheel contents before the drop come from MIME types

**Spec gap, not a spec change.** The wheel opens before the drop, and Chromium only exposes each dragged item's MIME type then, not its name. `itemsFromMimeTypes` maps MIME types to the formats table so the right wedges appear. On drop, main re-validates the real paths and refuses a wedge the real files do not offer. An unknown or empty MIME type opens the wheel greyed out with a hint, and Actions still work. **Needs Windows:** confirm Explorer drags report MIME types for HEIC, MKV, FLAC and the like; if not, the wedge list for those files will be disabled.

## DEVIATION-10: ffmpeg and 7-Zip builds

- `ffmpeg-static` ships a GPL build. It is started as a separate program with an argument list, which `AGENTS.md` allows, but redistributing a GPL binary carries obligations (offer the source). `docs/LICENSES.md` records this. An LGPL build would remove the obligation.
- `7zip-bin` bundles 7-Zip **16.02**, which is old. Archives are untrusted input, so a newer 7-Zip should replace it before wide release.

## DEVIATION-11: CSP

The CSP adds `convert-file:` to `img-src` and `media-src` for the preview protocol (files a tool window was opened with, served through an allow-list with CORS so canvases are not tainted). `connect-src 'none'` and `default-src 'self'` are unchanged. The protocol returns 403 for any path not registered for that window.

## DEVIATION-12: Actions

The reference shows Copy as "copy files to the clipboard" and Move as "choose a folder and move". Copy now puts the files on the clipboard (PowerShell `Set-Clipboard`, paths passed on stdin). The original folder copy is a seventh wedge, **Copy to**. AirDrop is macOS only and has no Windows equivalent, so it is omitted (docs/01 already excludes Share). Apple Pages is omitted as a format for the same reason.

## Smaller gaps filled (not in the specs)

- `Esc` in ARMED or DRAGGING returns to IDLE, so a cancelled drag cannot leave the state machine stuck.
- Wedge 0 starts at the 12 o'clock edge and runs clockwise.
- Split needs exactly one PDF; Merge needs two or more. Collage needs two or more images; single-image tools need one.
- Output names for editors carry a suffix: `-cropped`, `-edited`, `-annotated`, `-redacted`, `-bg`, `-collage`, `-metadata`, `-merged`.
- A multi-file `.tar.gz` made from a ZIP is named `.tar.gz`; GZIP on its own cannot hold several files.
- `resizePreset` was added to the settings schema (additive, version stays 1) for the Resize preset the Output page needs.
- Recent Copy/Move folders and the Float dock edge are kept in `state.json`, not in settings.
- On non-Windows systems, drop-path validation uses POSIX rules so tests and development work; the Windows rules are unchanged and tested.
- Annotation, redaction and metadata inputs from tool windows are re-checked in main: files must be ones the window was opened with or picked itself; tags are an allow-list; the annotate temp file must be in the temp folder with a fixed name.

## Needs Windows (unverified)

- Everything in `docs/AUDIT.md` spikes A to E: mid-drag overlay, drop, hook behavior, window-class gating, key interactions, registration probe, timings.
- HEIC output script (`src/main/engines/heic.ts`). It follows the documented WinRT pattern, is probed at startup, and hides the HEIC wedge if the probe fails.
- Windows Terminal, PowerShell and cmd launch (`terminal.ts`), and Set-Clipboard file copy.
- The `.bat` scripts and the NSIS installer. The Linux build was packaged as an unpacked directory to check the bundling config; no installer was produced.
- LibreOffice conversions (no LibreOffice was available). Their argument builder is unit-tested.
- Face detection accuracy. The model loads and the code path runs, but no photo with faces was available offline.
- Mixed-DPI placement: `physicalToDip` is a tested model of Electron's `screenToDipPoint`, not the call itself.
