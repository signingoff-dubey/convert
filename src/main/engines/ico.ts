/** A Windows icon file holding PNG pictures, one per size. Every current Windows reads PNG inside ICO. */
export function buildIco(pictures: readonly { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pictures.length, 4);
  const directory = Buffer.alloc(16 * pictures.length);
  let offset = header.length + directory.length;
  pictures.forEach((p, i) => {
    const at = i * 16;
    directory.writeUInt8(p.size >= 256 ? 0 : p.size, at); // 0 means 256
    directory.writeUInt8(p.size >= 256 ? 0 : p.size, at + 1);
    directory.writeUInt8(0, at + 2); // no palette
    directory.writeUInt8(0, at + 3);
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(p.png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += p.png.length;
  });
  return Buffer.concat([header, directory, ...pictures.map((p) => p.png)]);
}

/** Icon sizes worth including for a picture of this size: never larger than the picture itself. */
export function iconSizes(width: number, height: number): number[] {
  const longest = Math.max(width, height);
  const sizes = [16, 24, 32, 48, 64, 128, 256].filter((s) => s <= longest);
  return sizes.length > 0 ? sizes : [16];
}
