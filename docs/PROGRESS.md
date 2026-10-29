# Progress

Honest status: what exists, what was verified and how, and what still needs a Windows machine.

## Verified here (Linux container)

| Check | How |
|---|---|
| Types, lint, formatting | `tsc --noEmit` (strict), ESLint (no `any`), Prettier: all clean |
| 285 unit and golden-file tests | `npm test`: state machine, key combos, conflicts, naming, drop-path validation, settings recovery, formats, wedge preferences, layout maths, crop dragging, annotation drawing, toast text, float docking, dispatch, actions, EPUB, RTF, offline OCR, and real conversions |
| Real conversions | images (every target), audio, video (progress, cancel), PDF (render, text, split, merge, EPUB, XLSX), documents, spreadsheets, subtitles, archives, plus Crop, Edit, Add BG, Collage, Redact, Annotate, Metadata, combined PDF |
| Source file untouched | every conversion test hashes the source before and after |
| No temp files left | cancel and corrupt-input tests check the output folder |
| Offline guarantee | a test scans `src/` for remote URLs; only XML namespace names are allowed |
| App starts and renders | run under a virtual display with Playwright: onboarding, all nine settings pages, all eleven tool windows, the overlay wheel built from drag MIME types |
| IPC allow-list | a forbidden channel is rejected in the preload; main re-checks the calling window |
| Tool windows run real jobs | Crop, Annotate (canvas export through IPC) and Redact (offline OCR detection) produced output files from the real UI |
| Packaging config | an unpacked Linux package started, and every bundled engine reported Ready from the unpacked paths |

## Needs a Windows machine (not verified)

See `docs/WINDOWS-TEST-PLAN.md`. In short: the global hook, mid-drag overlay and drop, window-class gating, key interactions, the registration probe, timings and memory, the HEIC encoder script, Terminal and clipboard launch, the `.bat` scripts, the NSIS installer, autostart, mixed-DPI placement, and LibreOffice-backed conversions.

## Acceptance by phase

| Phase | Accepted? | Notes |
|---|---|---|
| 0 Audit and spikes | **No** | Spikes not run. Audit is partial (`docs/AUDIT.md`). |
| 1 Skeleton, settings, themes | Mostly | Contrast test passes for every theme and preset; corrupt settings recover; live theme switching shown to work. Open: Run key via `reg query`, idle RAM budget. |
| 2 Trigger engine and overlay | **No** | State machine and engine pass their tests. Wheel visible under 80 ms, real combos, and the `docs/04` section 5 table need Windows. |
| 3 Images and PDF | Yes | Golden tests, collision naming, cancel without temp files, undo deletes only the output. |
| 4 Audio, video, Actions | Mostly | ffmpeg progress and cancel verified. Terminal at a folder with spaces and unicode needs Windows. |
| 5 Documents, sheets, subtitles, archives | Mostly | Everything not needing LibreOffice is tested. Hidden wedges when an engine is missing are tested through the dispatch logic. |
| 6 Polish, packaging, release | Partly | Onboarding, log folder, import/export, licenses, icons and the installer config exist. No installer was built; clean-install and uninstall checks need Windows. |

## Known limitations

- XLSX from PDF reads text positions, so it suits simple tables and not scanned pages.
- Face detection finds faces; check the result before sharing. Text detection is English only.
- PDF to DOCX and PPTX use LibreOffice's importer, so layout fidelity is LibreOffice's.
- `.gz` outputs from archives are `.tar.gz` when the source has several files.
- 7-Zip 16.02 is old (DEVIATION-10).
