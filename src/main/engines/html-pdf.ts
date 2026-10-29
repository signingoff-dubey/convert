/**
 * Turns an HTML file into a PDF. The real renderer is Chromium's own print-to-PDF, which the app registers
 * at startup; engines only see this small interface, so they stay testable without Electron.
 */
export type HtmlToPdf = (htmlPath: string, pdfPath: string, signal: AbortSignal) => Promise<void>;

let renderer: HtmlToPdf | null = null;

export function setHtmlToPdf(fn: HtmlToPdf | null): void {
  renderer = fn;
}

export function htmlToPdfAvailable(): boolean {
  return renderer !== null;
}

export function htmlToPdf(htmlPath: string, pdfPath: string, signal: AbortSignal): Promise<void> {
  if (!renderer) return Promise.reject(new Error('no HTML renderer'));
  return renderer(htmlPath, pdfPath, signal);
}
