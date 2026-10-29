import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { invoke, on } from '../shared/api';

/**
 * A hidden page that opens PDFs for the main process: it draws pages and reads their text with pdf.js.
 * Chromium's own canvas does the drawing, so no native canvas module is needed in the main process.
 */
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface Req {
  id: number;
  op: 'open' | 'size' | 'image' | 'text' | 'images' | 'cleanup' | 'close';
  doc?: number;
  n?: number;
  scale?: number;
  format?: 'png' | 'jpg';
  data?: Uint8Array;
}

const MAX_SIDE = 12000;
const MAX_PIXELS = 120_000_000;

type Doc = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
type Task = ReturnType<typeof pdfjs.getDocument>;
const docs = new Map<number, { task: Task; doc: Doc }>();
let nextDoc = 1;

async function handle(req: Req): Promise<unknown> {
  if (req.op === 'open') {
    const task = pdfjs.getDocument({
      data: req.data,
      useSystemFonts: true,
      verbosity: 0,
    });
    const doc = await task.promise;
    const id = nextDoc++;
    docs.set(id, { task, doc });
    return { doc: id, pages: doc.numPages };
  }
  const entry = docs.get(req.doc ?? -1);
  if (!entry) throw new Error('unknown document');
  if (req.op === 'close') {
    docs.delete(req.doc as number);
    await entry.task.destroy();
    return null;
  }
  const page = await entry.doc.getPage(req.n ?? 1);
  try {
    if (req.op === 'size') {
      const v = page.getViewport({ scale: 1 });
      return { width: v.width, height: v.height };
    }
    if (req.op === 'images') {
      const { fnArray } = await page.getOperatorList();
      const paints = [
        pdfjs.OPS.paintImageXObject,
        pdfjs.OPS.paintInlineImageXObject,
        pdfjs.OPS.paintImageMaskXObject,
      ];
      return fnArray.some((f) => paints.includes(f));
    }
    if (req.op === 'text') {
      const content = await page.getTextContent();
      return content.items.map((i) =>
        'str' in i
          ? {
              str: i.str,
              hasEOL: i.hasEOL,
              transform: i.transform,
              width: i.width,
              height: i.height,
            }
          : {},
      );
    }
    if (req.op === 'image') {
      const base = page.getViewport({ scale: 1 });
      // Very large pages are drawn smaller than asked rather than failing on a canvas size limit.
      const wanted = req.scale ?? 1;
      const limit = Math.min(
        MAX_SIDE / Math.max(base.width, base.height),
        Math.sqrt(MAX_PIXELS / (base.width * base.height)),
      );
      const viewport = page.getViewport({ scale: Math.min(wanted, limit) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no canvas');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, canvas, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, req.format === 'jpg' ? 'image/jpeg' : 'image/png', 0.92),
      );
      if (!blob) throw new Error('could not encode the page');
      return new Uint8Array(await blob.arrayBuffer());
    }
    return null;
  } finally {
    page.cleanup();
  }
}

on<Req>('pdfrender:req', (req) => {
  void handle(req).then(
    (value) => invoke('pdfrender:res', { id: req.id, ok: true, value }),
    (error: unknown) => {
      const name = (error as { name?: string }).name ?? '';
      invoke('pdfrender:res', {
        id: req.id,
        ok: false,
        error:
          name === 'PasswordException' ? 'password' : error instanceof Error ? error.message : name,
      }).catch(() => undefined);
    },
  );
});
