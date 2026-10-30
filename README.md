# Convert

**Drag a file. Tap a key. Drop on a wheel.**
An offline, always-running file converter and file-tools launcher for Windows.

Inspired by the interaction idea of Tangerine for Mac. Convert shares no code, name, icons, or assets with it.

---

## Use it (Windows 10 22H2 or Windows 11, 64-bit)

You need [Node.js](https://nodejs.org) 20 or newer (the LTS version is fine). Then double-click these files in this folder:

| File | What it does |
|---|---|
| `setup.bat` | **Run this first.** Shows what is already installed, then installs and builds only what is missing. Needs internet when something has to be installed. |
| `start.bat` | Starts Convert. It lives in the system tray. |
| `package.bat` | Builds an installer, `release\Convert-Setup-1.0.0.exe`. Per-user, no administrator rights. |
| `portable.bat` | Builds a folder you can copy anywhere, `release\win-unpacked\Convert.exe`. |
| `diagnose.bat` | Shows what is installed and opens the log folder. |
| `check.bat` | Runs the type checks, lint and tests. |
| `dev.bat` | Development mode with live reload. |
| `clean.bat` | Deletes build output. `clean.bat all` also deletes `node_modules`. |
| `remove-startup-entry.bat` | Removes the start-with-Windows entry. |

Convert has **no network code**. The internet is needed only by `setup.bat` and `package.bat`, to download the build tools and bundled converters.

## What it does

1. You start dragging a file or folder in Explorer or on the Desktop.
2. While still holding the mouse button, you tap a key (default `Shift+C`, `Shift+T` or `Shift+A`).
3. A radial wheel opens under your cursor and stays open.
4. You drop the file on a wedge. The job runs on your computer. A toast tells you when it is done.

Your original is never changed. Results are saved in the same folder as it, with no new folder, and Convert never overwrites: a taken name becomes `name (1).ext`. The toast says which folder, and "Show in folder" opens it with the result selected. A small progress ring follows your pointer while a longer job runs.

## The three wheels

| Wheel | Default | Purpose |
|---|---|---|
| Convert | `Shift+C` | Change format |
| Tools | `Shift+T` | Compress, edit, crop, redact, annotate, merge, password, and more |
| Share | `Shift+S` | Send files to Claude, ChatGPT, Telegram, WhatsApp, Discord, Slack or Email (copies the files and opens the app; paste with Ctrl+V) |
| Actions | `Shift+A` | Copy, Move, Copy Path, Terminal, Float, Copy to, Reveal |

Keys are configurable under Settings, then Triggers, with a conflict checker. See `docs/04-KEYBINDINGS-AND-CONFLICTS.md`.

### Supported formats

| Type | Formats |
|---|---|
| Images | JPG, PNG, WebP, HEIC, TIFF, AVIF, BMP; SVG input; PDF export (several images become one PDF) |
| Audio | MP3, M4A, WAV, FLAC, OGG, Opus, AIFF, WMA |
| Video | MP4, MOV, MKV, WebM, AVI, WMV, GIF; MP3 export |
| PDF | to DOCX\*, PPTX\*, XLSX (best effort), JPG, PNG (300 DPI), EPUB, TXT, MD |
| Documents | DOCX, Markdown, TXT, HTML, EPUB, PDF\*; RTF input |
| Slides | PPT, PPTX to PDF\*, JPG\*, PNG\* |
| Spreadsheets | XLSX, ODS\*, CSV, TSV, PDF\*; XLS input |
| EPUB | read and write |
| Subtitles | SRT, VTT, TXT |
| Archives | ZIP, TAR, GZIP, extract; RAR input |

\* needs [LibreOffice](https://www.libreoffice.org) installed. Without it those wedges are hidden, never shown and then failing. HEIC output needs Microsoft's free "HEIF Image Extensions".

### Image tools

Compress (target size, percentage or preset, with resize), Redact (detects faces and text on your computer, then covers or blurs them), Metadata (edit camera and location tags, or remove them), Edit (exposure, colour, detail, effects, rotate, flip), Crop (ratio or exact size), Add BG (colour, gradient or image behind a photo), Annotate (arrows, shapes, text, numbered callouts), and Collage (grid, row, column or featured).

Other types have their own tools:

- **Images (one or many):** Compress, Upscale, Remove BG, Copy text (OCR), and, for one image, Redact, Metadata, Edit, Crop, Add BG, Annotate; Collage for two or more. Convert any image to TXT to read its text.
- **PDF:** Compress, Split, **Delete pages** (a thumbnail of every page, untick the ones to drop), **Merge** (two or more), **Password** (add or remove), Copy text. Scanned PDFs are read with OCR.
- **Video:** Trim, Compress, Extract audio, **Extract frames** into a folder, **Merge** (two or more). **Audio:** Trim, Compress, Normalize, Merge.
- **Text and Markdown:** Merge two or more; Markdown, text, HTML and EPUB convert to PDF without installing anything.
- **ZIP:** Password (add or remove). Select several ZIPs and choose Extract here: each unzips into its own folder.
- **Actions:** Zip any mix of files and folders into one archive.

## Stack

Electron + React + TypeScript (strict) + Vite (electron-vite) + Zustand + Tailwind with CSS-variable theming. Native pieces: `uiohook-napi` for global hooks, `koffi` for Win32 calls. Engines: ffmpeg, sharp, pdf-lib, pdf.js, exiftool, 7-Zip, Tesseract (offline OCR), and a bundled face-detection model.

## Docs

| File | What it holds |
|---|---|
| `AGENTS.md` | Rules for the AI agent |
| `docs/01-PRODUCT-SPEC.md` | UX, wheels, behavior, edge cases |
| `docs/02-ARCHITECTURE.md` | Process model, trigger engine, overlay, IPC, risks |
| `docs/03-SETTINGS-AND-THEMES.md` | Settings window, schema, themes |
| `docs/04-KEYBINDINGS-AND-CONFLICTS.md` | Combos, validation, the registration probe |
| `docs/05-CONVERSION-ENGINE.md` | Engines, format matrix, job queue, naming |
| `docs/06-BUILD-PLAN.md` | Phases and acceptance checks |
| `docs/DECISIONS.md` | Every deviation from the specs, with evidence |
| `docs/AUDIT.md` | Environment, dependency audit, spike results |
| `docs/PROGRESS.md` | What was built and verified, and what still needs a Windows machine |
| `docs/WINDOWS-TEST-PLAN.md` | Step-by-step checks to run on a real Windows PC |
| `docs/LICENSES.md` | Third-party licenses (generated) |
| `docs/SIGNING.md` | Optional code signing |

## Status

The conversion engines, the job queue, settings, all windows and the packaging config are built and tested. **The global hook, mid-drag overlay and drop were written without access to a Windows machine, so they have not been run.** Read `docs/PROGRESS.md` before relying on them, and run `docs/WINDOWS-TEST-PLAN.md` on a real PC.
