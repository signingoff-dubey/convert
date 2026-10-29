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

## DEVIATION-4: Wheels hold up to 8 wedges (10 for Tools)

`docs/01` says at most 7. The Tools wheel holds up to 10, because one image now offers Compress, Redact, Metadata, Edit, Crop, Add BG, Annotate, Upscale, Remove BG and Copy text. The PDF wheel has 8 targets (DOCX, PPTX, XLSX, JPG, PNG, EPUB, TXT, MD) and audio and video have 8 once their own format is not removed. Hit-testing and drawing work for any count; a test asserts no real source file produces more than 8.

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

## DEVIATION-13: Results sit beside the original, with no new folder

- **What:** `docs/05` section 6 put PDF pages in a new folder `name\`. Jobs that make several files (PDF to images, slides to images, Split, Extract here) now save them directly in the original's folder, with the same never-overwrite numbering: `doc-001 (1).png`. The "Converted" subfolder option stays, off by default, and a custom output folder still works.
- **Why:** the owner asked that new files appear exactly where the original is.
- **Evidence:** a test renders a PDF and asserts every page file is in the PDF's own folder and no folder was created; another asserts a second run numbers every file.
- **Also:** the toast now names the folder ("Saved in D:\\Photos", "12 files saved in D:\\Docs"), "Show in folder" opens that folder with the first result selected, and Undo removes every file the job made.
- **Trade-off:** Extract here no longer wraps an archive's contents in a folder, so a large archive can scatter many files into a busy folder. Undo removes them within 12 seconds.

## DEVIATION-14: Wheel look and the cursor loader

The wheel was redrawn to match the reference photo: a full circle with a rim, rounded pie sections (true tangent fillets, tested), and a capsule in the centre that shows the dragged file's extension, then the hovered target's. A small click-through progress ring follows the pointer while a job runs longer than 0.6 s (Settings, Output turns it off). Both are visual additions to `docs/01`.

## Smaller gaps filled (not in the specs)

- `setup.bat` runs `scripts/check-env.cjs` first, prints what is installed, and installs only what is missing (packages, the ffmpeg and Electron downloads, the build). `diagnose.bat` prints the same table.
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

## DEVIATION-15: Multi-file tools, text, merging and passwords

Added at the owner's request, in the same spirit as DEVIATION-3.

- **Zip** (an action) takes any mix of files and folders. **Merge** joins PDFs, videos, audio files, and text or Markdown files (two or more, in the order chosen in the window; a result is named after the first one with `-merged`). Videos are fitted into the first video's frame size (padded, never stretched) at 30 fps; a clip with no sound gets silence of its own length so the sound stays in sync.
- **Upscale** is high-quality resampling (Lanczos plus an optional light sharpen), 2x to 4x, for many images at once. It is not AI and invents no detail; the window says so. A result larger than 16,000 px a side or 200 megapixels is refused.
- **Remove background** works on plain backgrounds only: it reads the colour at the picture's edge and clears what is close to it and connected to the edge. A person or object on a busy background will not come out cleanly. A real cut-out model was not used because the available ones are either not licensed for redistribution or are hundreds of megabytes of runtime. The window and the Features page say this. The same code runs the preview and the saved file.
- **Delete pages** shows every page as a thumbnail, all kept, and saves the kept ones as `-edited.pdf`. **Extract frames** and **Unzip** write into a folder (DEVIATION-13 explains why those two are folders).
- **TXT from anything**: pictures are read with Tesseract (English data only is bundled). Several recognizers run side by side on a pool of up to 4, and a tall page is cut only at fully blank rows so no line is split: on a four-core test machine a 40-line page took 4.7 s with one recognizer and 2.3 s with three. PDFs with no text layer fall back to the same OCR page by page. Spreadsheets become tab-separated text. Audio and video have no TXT target: speech recognition would need a model that is not bundled.
- **Copy text** (a tool) puts the text on the clipboard instead of writing a file; with several files each is headed by its name. The toast reports the number of characters.
- **Markdown, text, HTML and EPUB to PDF** no longer need LibreOffice: they are typeset by Chromium's print-to-PDF in a hidden window with scripts off and all network blocked. Word and RTF still use LibreOffice when it is installed and the built-in renderer otherwise.
- **Passwords** (a tool, PDF and ZIP): adds AES-256 (PDF: user and owner password are the same; ZIP: `-mem=AES256`), or removes one when the user types it. Removal writes a new file; the original is untouched. A wrong password is reported as such. The ZIP password is on the command line of a local 7-Zip child process for the length of the job; the PDF password never leaves the process. Removing a PDF password copies the pages into a fresh document, so outlines and form fields are not carried over (re-saving the opened document would keep it encrypted).
- **Mixed selections**: the Convert wheel offers every target any selected file can use; each file already in the chosen format, or that cannot go there, is skipped with a message.

## DEVIATION-16: PDFs are read in a hidden Chromium window

`@napi-rs/canvas` (which pdf.js uses in Node to draw pages) crashes the Electron 45 main process the moment it is loaded (`SIGTRAP`, reproduced with a bare `require` under both Electron and `ELECTRON_RUN_AS_NODE`). Everything that reads a PDF with pdf.js (page pictures, page thumbnails, text for TXT, MD, EPUB and XLSX, OCR of scans) therefore runs in a hidden, sandboxed `pdfrender` page that Chromium draws on, with the same document interface the engines use in Node (`setPdfBackend`). `@napi-rs/canvas` is now a dev dependency, used only by the Node fallback that the tests exercise. Verified end to end in the real app under Xvfb (`scripts/smoke.cjs`). JPEG 2000 images and CJK fonts that need pdf.js data files are not supported in that window.

## DEVIATION-17: Files that hold more than text, and missing fonts

- **Workbooks:** every sheet is exported. CSV and TSV give one file per sheet beside the workbook (`book - Sales.csv`); a single sheet keeps the workbook's name. TXT puts all sheets in one file under a `## Sheet` heading each.
- **PDFs with pictures:** for TXT and MD, any page that paints a picture (a chart, screenshot or scanned insert) is also read with OCR, and lines not already in the page's own text are added (MD marks them "Text found in pictures on this page"). A page with no text at all is read entirely by OCR. EPUB and XLSX from PDF still use the text layer only. Graphs drawn as vectors keep their labels as text; the bars themselves are not text and cannot be converted.
- **Nothing is dropped silently:** when a conversion cannot carry something over, the job still succeeds and the toast says so: charts or embedded files (such as an Excel sheet) in a Word file converted without LibreOffice, charts or pictures in a workbook going to CSV/TSV/TXT, and files attached to a PDF. Extracting embedded files is not built.
- **Missing fonts become Inter:** Inter (SIL OFL) is bundled. Documents printed to PDF get a `@font-face` for every font family they name: the installed font when it exists, otherwise Inter. The app's own screens and Annotate also end their font stack in Inter. Fonts inside SVG files rendered by sharp are not covered, and PDFs that use non-embedded fonts are drawn by pdf.js with whatever the system offers.
- **Windows fixes found by CI:** pdf.js needs its font folder URL to end in `/`; an empty media file is reported as corrupt on every system; ESM packages are imported by absolute file URL so they load from an installed app, not only from the project folder.
