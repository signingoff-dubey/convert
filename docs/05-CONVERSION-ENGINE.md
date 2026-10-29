# 05 — Conversion Engine

## 1. Principles

- **Local only.** Everything runs from bundled libraries and binaries.
- **Safe by construction.** Write to a temp file in the destination folder, then rename. Never overwrite. Never touch the source.
- **Pluggable.** Every engine implements one interface so the wheel, queue, and UI don't care which library does the work.
- **Honest.** If a conversion isn't supported, its wedge isn't shown. Don't show wedges that fail.

```ts
export interface Engine {
  id: string;
  canHandle(op: Operation, input: InputFile): boolean;
  run(op: Operation, input: InputFile, ctx: RunContext): Promise<OutputFile>;
}
export interface RunContext {
  outPath: string;                 // already collision-resolved temp path
  signal: AbortSignal;             // cancellation
  onProgress(percent: number): void;
  settings: Settings;
}
```

## 2. Engines and libraries

Check each license in Phase 0 (`AGENTS.md`: no AGPL or GPL linked in).

| Engine | Library | Handles |
|---|---|---|
| Image | `sharp` | jpg, png, webp, avif, tiff, bmp (output via sharp or a small BMP encoder), resize, rotate, flip, compress |
| HEIC decode | `heic-convert` (WASM) | heic input only, then hand off to sharp |
| Audio / video | bundled `ffmpeg` executable (LGPL build) | all audio/video targets, extract audio, trim, compress |
| PDF create | `pdf-lib` | images → PDF |
| PDF render | `pdfjs-dist` + `@napi-rs/canvas` | PDF → PNG/JPG at 300 DPI, text extraction → TXT/MD |
| PDF edit | `pdf-lib` | split, merge, basic compress (object streams; no image recompress in v1) |
| Documents | `mammoth` (docx → html/text), `turndown` (html → md), `marked` (md → html), `docx` (to write DOCX) | docx, md, txt, html |
| Spreadsheets | `exceljs` + `papaparse` | xlsx ↔ csv/tsv |
| Subtitles | pure TypeScript parser | srt ↔ vtt, → txt |
| Archives | bundled `7za.exe` (`7zip-bin`) | zip, tar, gz, extract rar (input only) |
| Metadata | `exiftool-vendored` | strip metadata |
| Office (optional) | detected LibreOffice (`soffice --headless --convert-to`) | docx/xlsx/pptx → PDF |

Notes:

- [Likely] `sharp`'s prebuilt libvips doesn't decode HEIC due to licensing, which is why HEIC goes through `heic-convert`. HEIC **output** is out of scope for v1.
- [Likely] Pure-JS PDF → DOCX/PPTX/XLSX isn't realistic offline. It's **not in v1**. Don't ship low-quality output; leave the wedge out.
- `mupdf` is AGPL. Do not use it.
- The Office engine is optional because bundling LibreOffice adds around 300 MB. If it's missing, wedges needing it are hidden and Settings → Engines explains why.

## 3. v1 format matrix

Legend: ✔ supported in v1, ○ later, ✖ not planned.

| From → To | PNG | JPG | WebP | AVIF | TIFF | BMP | PDF | MP3 | WAV | FLAC | MP4 | WebM | GIF | TXT | MD | HTML | DOCX | CSV | XLSX |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Image | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | | | | | | | | | | | | |
| HEIC | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | | | | | | | | | | | | |
| Audio | | | | | | | | ✔ | ✔ | ✔ | | | | | | | | | |
| Video | | | | | | | | ✔ | | | ✔ | ✔ | ✔ | | | | | | |
| PDF | ✔ | ✔ | | | | | | | | | | | | ✔ | ✔ | | ○ | | |
| DOCX | | | | | | | ○* | | | | | | | ✔ | ✔ | ✔ | | | |
| MD / TXT | | | | | | | ○* | | | | | | | ✔ | ✔ | ✔ | ✔ | | |
| CSV / XLSX | | | | | | | ○* | | | | | | | | | | | ✔ | ✔ |

\* Needs the Office engine. Other audio targets (M4A, OGG, Opus, AIFF, WMA) and video inputs (MOV, MKV, AVI, WMV) are included through ffmpeg: treat any ffmpeg-readable input as supported, and expose the targets in `docs/01` §4.1.

The single source of truth is `src/shared/formats.ts`: extension → category, category → targets, and a function `targetsFor(files[]) → Target[]` (the intersection rule from `docs/01` §3). Unit-test it heavily.

## 4. Job queue

- **Concurrency:** 2 jobs at once (`os.cpus().length >= 8 ? 3 : 2`). A job is one input file. A multi-file drop becomes N jobs under one batch id, with one combined toast.
- **Isolation:** CPU-heavy work (sharp, pdf rendering) runs in `worker_threads`. ffmpeg, 7za, and exiftool run as child processes via `execFile` with an argument array.
- **Cancel:** every job has an `AbortController`. Cancel kills the child process, deletes the temp output, and reports `cancelled`.
- **Progress:** ffmpeg via `-progress pipe:1` parsed against the probed duration. Others report coarse steps (0, 50, 100).
- **Timeouts:** none by default (long videos exist), but a job with no progress for 120 s is flagged "stalled" in the toast with a Cancel button.
- **Results:** `{ jobId, input, output?, status: 'ok'|'error'|'cancelled', error?: { code, message } }`.

## 5. Output naming (`jobs/naming.ts`, pure, unit-tested)

```
resolveOutput(srcPath, newExt, settings, existsFn) → path
```

Rules:

1. Folder: source folder, or `<source>\Converted`, or the custom folder per settings. Create it if needed.
2. Base: source name without extension, then `.` plus the new extension (lowercase).
3. If the target already exists **or** equals the source path, append ` (1)`, ` (2)`, and so on until free.
4. Windows-illegal characters and reserved names (`CON`, `NUL`, ...) are handled; paths over 259 chars use the `\\?\` prefix internally.
5. Test cases must include: no collision, one collision, many collisions, same-extension re-encode (jpg → jpg compress), unicode names, trailing dots and spaces, long paths.

## 6. Per-operation defaults

| Operation | Default |
|---|---|
| Image → JPG/WebP/AVIF | Quality from settings (85). Strip nothing. Respect EXIF orientation (auto-rotate, then reset the tag). Flatten transparency onto white for JPG. |
| Image → PDF | One page per image, page size equals image size at 96 DPI, JPEG embedding where possible. |
| Video → MP4 | H.264 (libx264 if available, else the LGPL-compatible encoder), AAC, `-movflags +faststart`, CRF 23. |
| Video → GIF | 15 fps, width capped at 640, palette generation two-pass. |
| Video → MP3 | 192 kbps. |
| Audio → MP3 | 192 kbps. |
| Compress (image) | Re-encode at the target percent of the original size, searched by quality binary search (max 6 tries). Never output a larger file; if it can't get smaller, report "already compact". |
| Compress (video) | CRF 28 with the same codec. |
| Resize | Dialog-free: preset chips in Settings → Output (50%, 75%, 1080p, 720p). v1 default 50%. |
| Strip metadata | exiftool `-all=` on a copy. |
| PDF → PNG/JPG | All pages, 300 DPI, `name-001.png` style inside a new folder `name\`. |

## 7. Error codes (user-facing text lives in `shared/strings.ts`)

`E_UNSUPPORTED`, `E_CORRUPT_INPUT`, `E_ENGINE_MISSING`, `E_DISK_FULL`, `E_PERMISSION`, `E_PATH_TOO_LONG`, `E_ENCRYPTED_PDF`, `E_CANCELLED`, `E_STALLED`, `E_UNKNOWN`.

Each error maps to a short sentence and a suggested fix. The full stack goes to the log, never to the toast.

## 8. Tests

- Golden-file tests: a `tests/fixtures/` folder with tiny sample files (a few KB each). Convert and assert output type (magic bytes), dimensions or duration, and non-zero size.
- Every engine test asserts the **source file is unchanged** (hash before and after).
- Cancel tests: start a long ffmpeg job on a generated test file, cancel, and assert that no temp file remains.
- Corrupt-input tests: a truncated PNG, a zero-byte MP3, and an encrypted PDF each yield the right error code.
