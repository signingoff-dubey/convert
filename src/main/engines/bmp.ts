/** Minimal 32-bit BMP encoder (sharp has no BMP output). Input is tightly packed RGBA, top-down. */
export function encodeBmp(rgba: Buffer, width: number, height: number): Buffer {
  const rowBytes = width * 4;
  const pixelBytes = rowBytes * height;
  const header = 14 + 40;
  const out = Buffer.alloc(header + pixelBytes);
  out.write('BM', 0, 'ascii');
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(header, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22); // positive height: rows are stored bottom-up
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(32, 28);
  out.writeUInt32LE(0, 30); // BI_RGB
  out.writeUInt32LE(pixelBytes, 34);
  out.writeInt32LE(2835, 38);
  out.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * rowBytes;
    const dst = header + y * rowBytes;
    for (let x = 0; x < width; x++) {
      const s = src + x * 4;
      const d = dst + x * 4;
      out[d] = rgba[s + 2] ?? 0; // B
      out[d + 1] = rgba[s + 1] ?? 0; // G
      out[d + 2] = rgba[s] ?? 0; // R
      out[d + 3] = rgba[s + 3] ?? 255; // A
    }
  }
  return out;
}
