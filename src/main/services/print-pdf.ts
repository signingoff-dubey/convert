import { writeFile } from 'node:fs/promises';
import { BrowserWindow, session } from 'electron';
import { JobError } from '../jobs/types';
import type { HtmlToPdf } from '../engines/html-pdf';

const PARTITION = 'convert-print';
let locked = false;

/** A window nobody sees prints the page. Scripts are off and nothing may leave the machine. */
export const printHtmlToPdf: HtmlToPdf = async (htmlPath, pdfPath, signal) => {
  const ses = session.fromPartition(PARTITION);
  if (!locked) {
    locked = true;
    ses.webRequest.onBeforeRequest((details, callback) =>
      callback({ cancel: !/^(file|data|blob):/i.test(details.url) }),
    );
  }
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      partition: PARTITION,
      sandbox: true,
      javascript: false,
      contextIsolation: true,
    },
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const onAbort = (): void => {
    if (!win.isDestroyed()) win.destroy();
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    if (signal.aborted) throw new JobError('E_CANCELLED');
    await win.loadFile(htmlPath);
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.6, bottom: 0.6, left: 0.7, right: 0.7 },
    });
    await writeFile(pdfPath, pdf);
  } catch (error) {
    if (signal.aborted) throw new JobError('E_CANCELLED');
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
    if (!win.isDestroyed()) win.destroy();
  }
};
