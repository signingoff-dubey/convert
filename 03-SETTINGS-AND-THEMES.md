# 03 — Settings Window and Themes

## 1. Window

- Size 880×620, min 720×520. Opens centered. One instance only. Destroyed on close (to save RAM).
- Windows 11: `backgroundMaterial: 'mica'` with the custom title bar overlay. Windows 10: solid `--bg`.
- Layout: left sidebar nav (220 px), right content pane with a sticky page title. Changes apply **live**; there is no Save button. A small "Saved" indicator fades in on each change.
- Footer of the sidebar: app version, "Pause Convert" switch, "Reset all settings" link.

## 2. Pages

| Page | Contents |
|---|---|
| **General** | Start with Windows (switch). Show tray icon (always on in v1, shown disabled). Limit to Explorer and Desktop (switch) with an "Allowed windows" list under Advanced. Pause Convert. Language (English only, disabled). |
| **Triggers** | Three combo recorders (Convert, Tools, Actions). Per-row status badge (OK / Warning / Blocked). "Re-check conflicts" button. "Test combos" panel. "Reset to defaults." Full spec in `docs/04`. |
| **Appearance** | Theme picker (System, Graphite, Paper, Midnight). Accent swatches plus custom hex. Wheel style (Glass, Solid, Outline). Wheel size (S, M, L). Wheel opacity slider. Animations (Full, Reduced, Off). Live preview wheel that reacts to hover. |
| **Wheels** | Three tabs (Convert, Tools, Actions). Per category, reorder wedges by dragging, and toggle each on or off. "Reset this wheel." Live preview as on Appearance. |
| **Output** | Location (Next to source / Custom folder). Subfolder "Converted" switch. Name collision rule (Number it, fixed in v1). Send original to Recycle Bin (switch, confirm dialog). Toast position and duration. Defaults for Compress quality, Resize, and so on. |
| **Engines** | Status rows for ffmpeg, image engine, PDF engine, exiftool, 7-Zip, Office engine (optional). Each shows version and Ready or Missing. Office engine: "Detect LibreOffice" button, path field. |
| **Advanced** | Allowed window classes (list, add/remove). Log level. Open log folder. Export settings, Import settings. Elevation note (see `docs/02` §8). |
| **About** | Version, licenses (renders `LICENSES.md`), "Convert is inspired by the drag-and-wheel idea; it contains no third-party app code." |

## 3. Settings schema (zod, authoritative)

```ts
export const Combo = z.object({
  modifiers: z.array(z.enum(['shift', 'ctrl', 'alt'])).min(1).max(2),
  code: z.string().regex(/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2]))$/),
});

export const Settings = z.object({
  version: z.literal(1),
  general: z.object({
    startWithWindows: z.boolean().default(true),
    limitToExplorerAndDesktop: z.boolean().default(true),
    paused: z.boolean().default(false),
    allowedWindowClasses: z.array(z.string()).default(['CabinetWClass', 'Progman', 'WorkerW']),
  }),
  triggers: z.object({
    convert: Combo.default({ modifiers: ['shift'], code: 'KeyC' }),
    tools:   Combo.default({ modifiers: ['shift'], code: 'KeyT' }),
    actions: Combo.default({ modifiers: ['shift'], code: 'KeyA' }),
  }),
  appearance: z.object({
    theme: z.enum(['system', 'graphite', 'paper', 'midnight']).default('system'),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#7C5CFF'),
    wheelStyle: z.enum(['glass', 'solid', 'outline']).default('glass'),
    wheelSize: z.enum(['s', 'm', 'l']).default('m'),      // 220 / 280 / 340 px
    wheelOpacity: z.number().min(0.5).max(1).default(0.92),
    animations: z.enum(['full', 'reduced', 'off']).default('full'),
  }),
  wheels: z.object({
    order:   z.record(z.string(), z.array(z.string())).default({}),   // key: "convert:image"
    disabled: z.record(z.string(), z.array(z.string())).default({}),
  }),
  output: z.object({
    location: z.enum(['nextToSource', 'custom']).default('nextToSource'),
    customFolder: z.string().nullable().default(null),
    useConvertedSubfolder: z.boolean().default(false),
    recycleOriginal: z.boolean().default(false),
    toastPosition: z.enum(['bottomRight', 'bottomLeft', 'topRight']).default('bottomRight'),
    toastSeconds: z.number().min(2).max(15).default(6),
    imageQuality: z.number().min(40).max(100).default(85),
    compressTargetPercent: z.number().min(10).max(90).default(50),
    preferredShell: z.enum(['wt', 'powershell', 'cmd']).default('wt'),
  }),
  engines: z.object({ officeEnginePath: z.string().nullable().default(null) }),
  advanced: z.object({ logLevel: z.enum(['error', 'info', 'debug']).default('info') }),
});
```

Rules:

- `version` plus `migrate.ts` handle future schema changes. An unknown or invalid file is **not** deleted: back it up as `settings.bad-<timestamp>.json` and load defaults.
- Writes are debounced (300 ms) and atomic (temp file then rename).
- Every change is validated in main, then broadcast on `settings:changed`.

## 4. Themes

Themes are sets of CSS variables on `:root[data-theme="…"]`. Components use only these tokens (no hard-coded colors).

| Token | Graphite (dark) | Paper (light) | Midnight (AMOLED) |
|---|---|---|---|
| `--bg` | `#14151A` | `#F6F6F8` | `#000000` |
| `--surface` | `#1C1E25` | `#FFFFFF` | `#0B0B0E` |
| `--surface-2` | `#252832` | `#EEEEF2` | `#141418` |
| `--border` | `#2F3340` | `#DADCE3` | `#22232A` |
| `--text` | `#E8EAF0` | `#16171B` | `#F2F3F7` |
| `--text-muted` | `#9AA0B2` | `#5F6475` | `#8B90A0` |
| `--danger` | `#FF5C6C` | `#D92D43` | `#FF5C6C` |
| `--success` | `#3DDC97` | `#1E9E64` | `#3DDC97` |

`system` follows `prefers-color-scheme` and maps to Graphite or Paper, updating live when the OS changes.

### Accent

Default `#7C5CFF` (Violet). Presets: Violet `#7C5CFF`, Cyan `#19C3E6`, Lime `#8BD22E`, Rose `#FF4D7A`, Amber `#FFB020`. A custom hex field is also allowed.

From the accent, derive at runtime (in `theme/accent.ts`, unit-tested):

- `--accent` (as chosen)
- `--accent-hover` (lighten 8% in dark themes, darken 8% in light)
- `--accent-soft` (accent at 16% alpha, for backgrounds)
- `--on-accent` (black or white, whichever gives the higher contrast; must be at least 4.5:1, else nudge the accent's lightness until it passes)

### Wheel styles

| Style | Look |
|---|---|
| Glass | `backdrop-filter: blur(18px)`, `--surface` at the chosen opacity, 1 px `--border`, soft shadow |
| Solid | Opaque `--surface`, no blur, no shadow (fastest, best for old GPUs) |
| Outline | Transparent fill, 2 px `--accent` ring, wedge labels on a small `--surface` pill |

The highlighted wedge always fills with `--accent`, with label color `--on-accent`. Hover easing is 90 ms in Full, 0 ms in Reduced and Off. Open and close scale animation (0.92 → 1, 120 ms) runs only in Full.

[Likely] Backdrop blur in a transparent, always-on-top Electron window can be flaky on some GPUs. If Phase 2 shows problems, make Glass fall back to Solid automatically when blur isn't supported, and note it in `DECISIONS.md`.

## 5. Components (build these once, reuse everywhere)

`Switch`, `SegmentedControl`, `Slider`, `Swatch` and `SwatchRow`, `ColorInput`, `ComboRecorder`, `StatusBadge`, `SettingRow` (label, description, control), `Section`, `Callout`, `Toast`, `WheelPreview`, `SortableList`, `Dialog`, `PathField`.

Every control is keyboard accessible with a visible focus ring (2 px `--accent`, 2 px offset).

## 6. Behavior details

- **Live preview:** `WheelPreview` renders the same `Wheel` component as the overlay with mock wedges, driven by the draft settings. No IPC round-trip for visuals.
- **Theme switch:** apply the `data-theme` attribute immediately in all open windows through `settings:changed`. No flash of the wrong theme: the preload sets the attribute before the first paint.
- **Reset all settings:** confirm dialog; backs up the current file first.
- **Pausing:** the sidebar switch and the tray item are the same state.

## 7. Acceptance checks

- Switching theme and accent updates the settings window, an open overlay, and toasts without restart.
- Every theme and accent combination passes the 4.5:1 label contrast check (unit test iterates all presets).
- Corrupt `settings.json` is backed up and the app still starts.
- Settings window closes and idle RAM returns to within 10 MB of the pre-open baseline.
