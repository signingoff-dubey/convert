# Windows test plan

Run this on a real Windows 10 22H2 or Windows 11 machine. Mark each row Pass, Fail or Partial, and write what you saw. Anything that fails goes into `docs/AUDIT.md` and, if it changes the design, `docs/DECISIONS.md`.

## 0. Build and start

1. Run `setup.bat`. Expect: packages install, the build finishes, no red errors.
2. Run `start.bat`. Expect: a Convert tray icon, and the Settings window with the three-step welcome.
3. Run `diagnose.bat`. Expect: Node and npm versions, Packages installed, Build present.

## 1. The core interaction (Spikes A to D)

Use a folder with a PNG, a JPG, an MP3, a PDF and a sub-folder.

| # | Do this | Expect |
|---|---|---|
| 1 | In File Explorer, press and hold on `a.png`, drag a little, tap **Shift+C** | A wheel appears under the pointer without stealing focus. The drag continues. |
| 2 | Move onto the **JPG** wedge and release | `a.jpg` appears beside `a.png`. A toast says "Converted a.png → a.jpg". `a.png` is untouched. |
| 3 | Repeat, but tap **Shift+T**, then **Shift+A** while the wheel is open | The wheel switches in place each time. |
| 4 | Open a wheel, press **Esc** | The wheel closes. Nothing happens to the file. |
| 5 | Open a wheel, release in the middle hole | Cancels. Nothing happens. |
| 6 | Hold **Shift+C** for two seconds mid-drag | One wheel only. |
| 7 | While dragging, tap **Shift+C**, watch Explorer | No type-ahead selection, no rename box, nothing changes (key pass-through, DEVIATION-7). |
| 8 | Type **Shift+C** in Notepad and in a browser | Nothing happens. |
| 9 | Drag from the Desktop, from a second Explorer tab (Windows 11), and from the Downloads folder | The wheel opens each time. |
| 10 | Drag text in Notepad, then tap Shift+C | No wheel (gating). |
| 11 | Drag a file out of a ZIP shown in Explorer, then tap Shift+C and drop | The message "This item isn't a file on disk." and no job. |
| 12 | Start a drag, press Esc, then type in a rename box | Normal typing, no stuck wheel. |

If row 2 fails (the drop never arrives), the contingency is the `IDropTarget` addon in `docs/02` section 6.

## 2. Wheels and tools

| # | Do this | Expect |
|---|---|---|
| 13 | Drag one image, **Shift+C** | Wedges: PNG, JPG (minus its own), WebP, TIFF, AVIF, BMP, PDF. HEIC appears only if the HEIF extension is installed. |
| 14 | Drag an image and an MP3 together, **Shift+C** | The wheel is greyed out with "Select one type". |
| 15 | Drag a folder, **Shift+C** | Greyed out with a hint. **Shift+A** works. |
| 16 | Drag three images, **Shift+C**, drop on **PDF** | One PDF with three pages. |
| 17 | Drag one image, **Shift+T**, pick each of Compress, Edit, Crop, Add BG, Annotate, Metadata, Redact | A window opens for each, with a preview. Run produces a copy beside the original. |
| 18 | Drag two images, **Shift+T** | Compress and Collage only. |
| 19 | Redact: press Detect faces on a photo with faces, then Detect text on a screenshot | Boxes appear. Check that the faces are covered. |
| 20 | Actions: Copy, then paste in a folder | The file is pasted. |
| 21 | Actions: Move to a folder | The source is gone from the old folder. This is the only action that removes a source. |
| 22 | Actions: Terminal on a file inside a folder with spaces and accented letters | A terminal opens in that folder. |
| 23 | Actions: Float, then drag the chip into Notepad or an email | The file is attached or its path appears. Pin the shelf to each edge. |

## 3. Settings

| # | Do this | Expect |
|---|---|---|
| 24 | Triggers: change Convert to **Ctrl+Shift+K** | Takes effect at once. Try **Ctrl+C** (blocked) and **F5** (warning). |
| 25 | Run a small script that registers Shift+C, then Re-check | Warning that another app owns it. |
| 26 | Appearance: switch theme and accent while the wheel is closed, then drag | The wheel uses the new look. No restart. |
| 27 | General: turn on Pause, then drag and tap Shift+C | Nothing. Turn Pause off and it works again. |
| 28 | Output: turn on "Send original to Recycle Bin", convert a file | The source goes to the bin. Turn it off after. |
| 29 | Corrupt `%APPDATA%\Convert\settings.json` (type nonsense) and start | Defaults load and `settings.bad-<time>.json` appears beside it. |

## 4. Optional engines

Install LibreOffice, then Settings, then Engines, then Detect LibreOffice.

| # | Do this | Expect |
|---|---|---|
| 30 | Drag a `.docx`, Shift+C | A PDF wedge appears. Dropping on it makes a PDF. |
| 31 | Drag a PDF | DOCX and PPTX wedges appear and work. |
| 32 | Drag a `.pptx` | PDF, JPG, PNG wedges. JPG makes a folder of slides. |
| 33 | Drag an `.xls` or `.ods` | XLSX, CSV, TSV and PDF wedges. |
| 34 | Install the Store's "HEIF Image Extensions", restart Convert | A HEIC wedge appears for PNG and JPG. Convert one and open the result in Photos. |

## 5. Performance and memory (budget in `AGENTS.md`)

| # | Measure | Budget |
|---|---|---|
| 35 | Idle CPU in Task Manager, settings closed, Convert in the tray | under 1% |
| 36 | Idle RAM, all Convert processes added together, settings closed | under 150 MB |
| 37 | Time from key tap to wheel visible. Set Settings, Advanced, Log level to Debug and read "overlay shown in N ms" in the log (`diagnose.bat` opens it) | under 80 ms (median of 20) |

## 6. Install and uninstall

1. Run `package.bat`. Expect `release\Convert-Setup-1.0.0.exe`.
2. Install it on a clean VM. No administrator prompt. Convert starts after install.
3. Turn on Start with Windows, sign out and in. Convert is running in the tray; `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Run` shows a Convert value.
4. Uninstall. The Run value is gone. Your converted files and `%APPDATA%\Convert` remain.
5. A firewall block test: block Convert in Windows Firewall and repeat rows 2 and 16. Everything still works.

## 7. Source safety, across everything above

After every row that converts something, confirm the original still exists and is unchanged.
