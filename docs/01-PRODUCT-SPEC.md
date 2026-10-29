# 01 — Product Spec

## 1. Core interaction

```
press left button on a file/folder  →  move > 6 px (drag begins)
  →  press a wheel combo while still dragging (e.g. Shift+C)
  →  wheel appears centered on the cursor
  →  move toward a wedge (it highlights, center label shows the action)
  →  release the mouse on the wedge  →  job runs
```

Rules:

- The wheel **stays open** until you drop or cancel. Releasing the keys does not close it.
- Pressing a different wheel's combo while a wheel is open **switches wheels** in place.
- `Esc`, or dropping outside the wheel, **cancels**. Nothing happens to the file.
- The wheel always starts with the cursor in the neutral center hole. A drop in the hole is a cancel.
- If the drag has no real file paths (for example, a virtual file from a ZIP view or an email attachment), the wheel shows a one-line message: "This item isn't a file on disk." Drop does nothing.

## 2. Where it activates

Default: **Explorer windows and the Desktop only.** This is the "Limit to Explorer and Desktop" setting, and it's on by default.

When off, Convert may activate from any app. Drops without file paths are then ignored with a toast.

See `docs/02-ARCHITECTURE.md` for how the source window is identified.

## 3. Selection handling

| Dropped selection | Convert wheel | Tools wheel | Actions wheel |
|---|---|---|---|
| One file | targets for its type | tools for its type | all 6 actions |
| Many files, same category (all images) | targets common to all | tools common to all | all 6 actions |
| Mixed categories (image + audio) | disabled, with hint "Select one type" | disabled, with hint | all 6 actions |
| Folder or mixed with folders | disabled | disabled (v2: "Compress to ZIP") | all 6 actions |

A disabled wheel still opens, with all wedges greyed out and a hint under the center label. This avoids a silent no-op.

## 4. The wheels

Each wheel has **at most 7 wedges**. Wedges are laid out clockwise from 12 o'clock in the user's saved order (Settings → Wheels).

### 4.1 Convert wheel (targets by source category)

| Source | Wedges (default order) |
|---|---|
| Image (jpg, png, webp, heic, tiff, avif, bmp) | PNG, JPG, WebP, AVIF, TIFF, BMP, PDF |
| Audio (mp3, m4a, wav, flac, ogg, opus, wma) | MP3, M4A, WAV, FLAC, OGG, Opus |
| Video (mp4, mov, mkv, webm, avi, wmv) | MP4, WebM, MKV, GIF, MP3 (extract audio) |
| PDF | PNG, JPG, TXT, MD |
| Document (docx, md, txt, html) | PDF*, TXT, MD, HTML, DOCX |
| Spreadsheet (xlsx, csv, tsv) | XLSX, CSV, TSV |
| Subtitles (srt, vtt) | SRT, VTT, TXT |
| Archive (zip, tar, gz, rar-in) | Extract here, ZIP, TAR, GZ |

Items marked * need the optional Office engine (see `docs/05-CONVERSION-ENGINE.md`). Without it, the wedge is hidden and a "Why is PDF missing?" link appears in Settings → Engines.

HEIC is input-only in v1. A source never offers its own format as a target.

### 4.2 Tools wheel (v1)

| Source | Wedges |
|---|---|
| Image | Compress, Resize, Rotate, Flip, Strip metadata |
| Video | Compress, Trim start/end*, Extract audio |
| Audio | Compress, Trim*, Normalize |
| PDF | Compress, Split pages*, Merge* |

Items marked * open a small tool window (see 4.4). Everything else runs immediately with the defaults from Settings → Tools.

**v2 tools (do not build in v1):** Crop, Redact (face and text), Annotate, Add background, Edit (exposure, color), Edit metadata fields.

### 4.3 Actions wheel (v1) — works on anything

| Wedge | Behavior |
|---|---|
| Copy | Copies the file(s) to a folder picker destination, remembering recent folders. The source stays. |
| Move | Same picker, but moves. This is the only action that removes the source. |
| Copy Path | Puts the full path on the clipboard. Multiple files are joined with newlines. |
| Terminal | Opens Windows Terminal at the folder, falling back to PowerShell then cmd. The setting picks the preferred shell. |
| Float | Adds the file to the Float shelf, a small always-on-top strip of draggable chips you can drag out onto any app. |
| Reveal | Opens Explorer with the file selected. |

Not in v1: a Share or Quick Share wedge. Windows has no simple public API for it; revisit in v2.

### 4.4 Tool windows

Small, frameless, themed windows for Trim, Split, and Merge. They show a preview, a minimal control set, and a Run button. They share the same theme tokens as the settings window.

## 5. Output rules

Defaults (all changeable in Settings → Output):

- **Location:** next to the source file.
- **Name:** `{name}.{newext}`. On collision: `{name} (1).{newext}`, `(2)`, and so on. Never overwrite.
- **Optional subfolder:** `Converted/` created beside the source.
- **Original:** kept. Option: send the original to the Recycle Bin after a successful conversion. Off by default, with a confirm dialog the first time it's turned on.
- **Metadata:** preserved where the format allows. Tools → Strip metadata removes it.
- **Failure:** nothing is left behind. Write to a temp file in the output folder, then rename on success.

## 6. Feedback

- **Toast** (custom, themed, bottom-right, not a Windows toast): "Converted photo.heic → photo.png", with "Show in folder" and "Undo". Undo is available for 10 s and deletes the *output*, never the source.
- **Progress:** for jobs over 1 s, the toast shows a progress bar and Cancel.
- **Tray icon:** shows a small dot while a job is running.
- **Errors:** a toast with a short reason and a "Details" link that opens the log folder.

## 7. Tray menu

- Pause/Resume Convert (turns off all hooks)
- Open Settings
- Show Float shelf
- Open output log
- Quit

Left-clicking the tray opens Settings.

## 8. First run

1. Settings window opens on a short 3-step onboarding. It never auto-opens again.
2. Step 1: "Drag the sample file below onto the wheel", where the app generates a small PNG in `%TEMP%`. Step 2: shows the three default combos with a live "pressed" indicator. Step 3: toggles for Start with Windows (on by default) and Limit to Explorer and Desktop (on).
3. Auto-start is registered only after the user passes step 3.

## 9. Accessibility

- Settings window is fully keyboard navigable and screen-reader labeled.
- Reduced motion (OS setting or in-app toggle) disables wheel animations.
- Wheel contrast: label text must meet 4.5:1 against the wedge in every theme and accent.
- Wheel can't be operated by keyboard in v1 (it's drag-driven). A keyboard-first "selected file" mode is v2.

## 10. Non-goals (v1)

Cloud, accounts, telemetry, localization, macOS/Linux, batch rules/automation, OCR, a "convert from the right-click menu" shell extension (v2 idea).
