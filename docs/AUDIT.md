# Audit (Phase 0)

> **Status: partial.** This audit was written in a Linux container, not on a Windows machine. Environment facts, dependency versions and licenses are real. The Windows spikes were **not run**. See `docs/DECISIONS.md`, DEVIATION-1.

## 1. Environment

| Item | Value |
|---|---|
| OS the build ran on | Linux 6.18 (cloud container) |
| Windows build | not available |
| Real Windows machine | **no** |
| Node / npm | 22.22.0 / 10.9.4 |
| Electron | 45.1.0 |
| Display scaling, monitors | not applicable (virtual display used for UI checks) |

## 2. Dependency audit

Versions are the latest stable on the day of the build (`npm view`). "Windows x64 prebuilds" is `yes` where the package ships or downloads a Windows x64 binary; the lockfile contains the `win32-x64` packages for koffi, sharp and @napi-rs/canvas. Sizes are the installed size on Linux, for orientation only.

| Package | Version | License | Windows x64 prebuilds | Installed size |
|---|---|---|---|---|
| electron | 45.1.0 | MIT | yes | 290.7 MB |
| electron-vite | 6.0.0 | MIT | n/a (pure JS) | 0.1 MB |
| electron-builder | 26.18.0 | MIT | n/a (pure JS) | 0.1 MB |
| react | 19.3.1 | MIT | n/a (pure JS) | 0.2 MB |
| zustand | 5.0.16 | MIT | n/a (pure JS) | 0.1 MB |
| tailwindcss | 4.3.3 | MIT | n/a (pure JS) | 0.8 MB |
| zod | 4.6.7 | MIT | n/a (pure JS) | 6.1 MB |
| uiohook-napi | 1.5.5 | MIT | yes | 1.2 MB |
| koffi | 3.3.5 | MIT | yes | 1.7 MB |
| sharp | 0.35.5 | Apache-2.0 | yes | 1.0 MB |
| heic-convert | 2.1.0 | ISC | n/a (pure JS) | 0.0 MB |
| pdf-lib | 1.17.1 | MIT | n/a (pure JS) | 19.5 MB |
| pdfjs-dist | 6.4.299 | Apache-2.0 | n/a (pure JS) | 34.9 MB |
| @napi-rs/canvas | 1.0.13 | MIT | yes | 0.2 MB |
| mammoth | 1.13.0 | BSD-2-Clause | n/a (pure JS) | 1.7 MB |
| turndown | 7.2.4 | MIT | n/a (pure JS) | 0.2 MB |
| marked | 18.1.2 | MIT | n/a (pure JS) | 0.5 MB |
| docx | 9.15.0 | MIT | n/a (pure JS) | 20.4 MB |
| exceljs | 4.4.0 | MIT | n/a (pure JS) | 21.8 MB |
| papaparse | 5.7.0 | MIT | n/a (pure JS) | 0.3 MB |
| jszip | 3.10.2 | (MIT OR GPL-3.0-or-later) | n/a (pure JS) | 0.8 MB |
| 7zip-bin | 5.2.0 | MIT | yes | 12.3 MB |
| exiftool-vendored | 39.1.0 | MIT | n/a (pure JS) | 1.9 MB |
| ffmpeg-static | 5.3.0 | GPL-3.0-or-later | yes | 79.9 MB |
| tesseract.js | 7.0.0 | Apache-2.0 | n/a (pure JS) | 1.4 MB |
| @tesseract.js-data/eng | 1.0.0 | MIT | n/a (pure JS) | 13.9 MB |
| @vladmandic/face-api | 1.7.15 | MIT | n/a (pure JS) | 23.7 MB |
| lucide-react | 1.64.0 | ISC | n/a (pure JS) | 38.0 MB |
| vitest | 5.0.5 | MIT | n/a (pure JS) | 2.8 MB |
| typescript | 6.0.3 | Apache-2.0 | n/a (pure JS) | 24.3 MB |

Flags:

- **ffmpeg-static** is GPL-3.0-or-later. It is a separate executable, not linked. See DEVIATION-10.
- **jszip** is MIT OR GPL-3.0-or-later; Convert uses it under MIT.
- **7zip-bin** bundles 7-Zip 16.02 (old). See DEVIATION-10.
- **pdf-lib** has had no release since 2021. It is used for creating, merging, splitting and rewriting PDFs, which are stable features; rendering uses pdf.js.
- **buffers** (a transitive dependency of exceljs) has no license field. See `docs/LICENSES.md`.
- No AGPL package is present. `mupdf` (AGPL) was not used.
- `npm audit` reports advisories in development-time packages (the packager's own tooling). Run `npm audit` before a public release.

## 3. Spikes

| # | Spike | Result | Evidence |
|---|---|---|---|
| A | Drop onto a mid-drag overlay (shown with `showInactive`, `dragover`, `drop`, `getPathForFile`, source untouched) | **NOT RUN** | Needs Windows and a real Explorer drag. The overlay's drag handling was exercised only with synthetic `dragenter` and `dragover` events under Linux. |
| B | Hook behavior during an OLE drag; key suppression | **NOT RUN** | `uiohook-napi` documents no event consumption, so pass-through is built in (DEVIATION-7). |
| C | Window class under the cursor (Win10 Explorer, Win11 Explorer tabs, Desktop, browser, Notepad) | **NOT RUN** | `windowClassAt` is written with koffi (`WindowFromPoint`, `GetAncestor`, `GetClassNameW`) and unit-tested through a fake; never called on Windows. |
| D | Key interactions (`docs/04` section 5 rows 1, 2, 9, 10) | **NOT RUN** | Row 10 (key repeat gives one open event) is covered by a unit test of the state machine and the engine. |
| E | `globalShortcut` probe reports `taken` | **NOT RUN** | The probe wrapper is tested with a mocked `globalShortcut` (free, taken, throws, no accelerator). |
| - | Timings: keydown to overlay visible; idle RAM and CPU | **NOT RUN** | The overlay logs its own show time at debug level, ready for measurement. |

### Go/no-go on the contingencies in `docs/02` section 9

| Risk | Go or no-go | Reason |
|---|---|---|
| Mid-drag overlay does not receive drops | **Undecided** | Cannot be decided without spike A. The `IDropTarget` addon is not written. |
| Hook library cannot suppress keys | **Go: pass-through** | Built, untested on Windows. `WH_KEYBOARD_LL` fallback not written. |
| Windows 11 Explorer class check fails | **Undecided** | Needs spike C. The allowed class list is editable in Settings, then Advanced, for quick correction. |
| Idle RAM over budget | **Undecided** | Windows are created lazily (settings, toast, float, tool windows); the overlay is the only pre-created window. Measure with the test plan. |
| HEIC input unsupported in prebuilt sharp | **Go** | `heic-convert` decodes first. Tested only with the decode path present; no HEIC sample was available offline. |
| AV flags the global hook | **Accept** | Documented in `docs/SIGNING.md`. |

## 4. Deviations

See `docs/DECISIONS.md` (12 numbered deviations and a list of smaller gaps).
