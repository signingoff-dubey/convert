/** The part of a drag's data these helpers read, so they can be tested without a browser. */
export interface DragData {
  items: ArrayLike<{ kind: string; type: string }>;
  getData(type: string): string;
}

/** What the dragged item says it is. A picture dragged from a web page carries an address rather than a file. */
export function dragTypes(dt: DragData): string[] {
  const files = Array.from(dt.items)
    .filter((i) => i.kind === 'file')
    .map((i) => i.type);
  if (files.length > 0) return files;
  const web = Array.from(dt.items).some((i) =>
    /^(text\/uri-list|text\/html|DownloadURL)$/i.test(i.type),
  );
  // Until it is dropped the address cannot be read, so a web drag is shown the picture wheel; the drop checks it.
  return web ? ['image/png'] : [];
}

/** Picture addresses in a drop: the dragged link, else the first image in the dragged HTML. */
export function webAddresses(dt: DragData): string[] {
  const list = dt
    .getData('text/uri-list')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
  if (list.length > 0) return list;
  const html = dt.getData('text/html');
  const src = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(html)?.[1];
  return src ? [src.replace(/&amp;/g, '&')] : [];
}
