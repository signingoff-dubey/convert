# What changed in Convert

Newest first. Each release's notes on GitHub are taken from the matching section here.

## 1.3.2

- **Wheel labels fit.** Long names now wrap onto two lines instead of running outside their wedge, and picture-to-text shows as just **TXT**.
- **Hover to see what a wedge does.** Under the centre label a short sentence appears, such as "Reads the words in the picture" for TXT on a picture, or "Copies the words to the clipboard" for Copy text.

## 1.3.1

- **Update progress bar.** Settings → About shows a bar while a new version downloads, and a purple dot appears next to About.
- **Restart and update** button at the bottom of the sidebar as soon as an update is ready, so you never have to hunt for it.

## 1.3.0

- **Updates itself.** When you are online, Convert checks this project's GitHub releases about every six hours, downloads a newer version quietly, checks its checksum, and installs it when nothing is running. No prompts. Turn it off in Settings → General. Settings → About shows the status and has Check now.
- **Drag a picture out of a web browser** (Chrome, Edge, Firefox, Brave) onto the wheel. It is saved in Downloads first, then you can convert, compress or share it like any file.
- **Self-test** (Settings → Engines): every engine does a small real job on your PC so you can see what works. **Copy diagnostics** gives a shareable report with your name and folders hidden.
- **More robust.** Leftover working folders from a crash are cleaned up on the next start, and watch folders reconnect by themselves if a drive or folder comes back.
- Version 1.3.0 is the first with the updater, so install it by hand once.

## 1.2.0

- **Watch folders**: pick a folder and a format, and every new file is converted for you.
- **Recent**: your last results with thumbnails, Open and Show in folder.
- **Explorer Send to** and `Convert.exe --convert pdf file...` from the command line.
- **PDF page editor**: remove, turn and reorder pages, add a watermark or page numbers, or put 2, 4, 6 or 9 pages on a sheet.
- **New file types**: JSON, YAML, TOML, XML, CSV, contacts (VCF), calendars (ICS), fonts, email (EML), maps (GeoJSON, KML, GPX), ASS/LRC/SBV subtitles, ICO, AAC, AC3, and FLV, MPEG and 3GP video.

## 1.1.0

- **Share (Shift+S)** to Claude, ChatGPT, Telegram, WhatsApp, Discord, Slack and Email: copies the files and opens the app; paste with Ctrl+V.
- **Keep running in the background** setting, and a fuller Metadata window.

## 1.0.0

- The first release: the drag-and-wheel converter with Convert, Tools and Actions wheels, converters for images, audio, video, PDF, documents, spreadsheets, e-books, subtitles and archives, merge, password, OCR, upscale, background removal, and more.
- The installer is not code-signed, so Windows SmartScreen may say "unknown publisher". Choose More info, then Run anyway.
