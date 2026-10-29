/**
 * Background removal for plain backgrounds (studio shots, scans, screenshots, product photos).
 * It finds the background colour from the picture's edge, then clears every pixel that is close to that colour
 * and connected to the edge. It does not recognise people or objects, so busy backgrounds are not handled.
 * Pure and shared, so the preview in the window and the saved result use the same code.
 */

export interface BgParams {
  /** 0 to 100: how different from the background colour a pixel may be and still count as background. */
  tolerance: number;
  /** Width in pixels of the soft edge left around the subject (0 for a hard cut). */
  feather: number;
  /** Background colour, or null to read it from the picture's edge. */
  color: readonly [number, number, number] | null;
  /** True: only background touching the edge is removed. False: that colour is removed everywhere. */
  contiguous: boolean;
}

export const DEFAULT_BG: BgParams = { tolerance: 18, feather: 1, color: null, contiguous: true };

/** The most common edge colour, found by sampling the border and taking the middle value of each channel. */
export function detectBackground(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): [number, number, number] {
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  const take = (x: number, y: number): void => {
    const i = (y * width + x) * 4;
    r.push(rgba[i] as number);
    g.push(rgba[i + 1] as number);
    b.push(rgba[i + 2] as number);
  };
  const stepX = Math.max(1, Math.floor(width / 200));
  const stepY = Math.max(1, Math.floor(height / 200));
  for (let x = 0; x < width; x += stepX) {
    take(x, 0);
    take(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    take(0, y);
    take(width - 1, y);
  }
  const mid = (v: number[]): number => v.sort((p, q) => p - q)[Math.floor(v.length / 2)] as number;
  return [mid(r), mid(g), mid(b)];
}

function boxBlurAlpha(alpha: Uint8Array, width: number, height: number, radius: number): void {
  if (radius < 1) return;
  const tmp = new Float32Array(width * height);
  const win = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const row = y * width;
    for (let x = -radius; x <= radius; x++)
      sum += alpha[row + Math.min(width - 1, Math.max(0, x))] as number;
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / win;
      sum += alpha[row + Math.min(width - 1, x + radius + 1)] as number;
      sum -= alpha[row + Math.max(0, x - radius)] as number;
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++)
      sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x] as number;
    for (let y = 0; y < height; y++) {
      alpha[y * width + x] = Math.round(sum / win);
      sum += tmp[Math.min(height - 1, y + radius + 1) * width + x] as number;
      sum -= tmp[Math.max(0, y - radius) * width + x] as number;
    }
  }
}

/** Clears the background in place by lowering alpha. Returns the share of the picture that was removed (0 to 1). */
export function removeBackground(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  params: BgParams,
): number {
  const [br, bg, bb] = params.color ?? detectBackground(rgba, width, height);
  const limit = Math.max(0, Math.min(100, params.tolerance)) * 2.55;
  const near = (p: number): boolean => {
    const i = p * 4;
    return (
      Math.abs((rgba[i] as number) - br) <= limit &&
      Math.abs((rgba[i + 1] as number) - bg) <= limit &&
      Math.abs((rgba[i + 2] as number) - bb) <= limit
    );
  };
  const total = width * height;
  const gone = new Uint8Array(total);
  if (params.contiguous) {
    const stack = new Int32Array(total);
    let top = 0;
    const push = (p: number): void => {
      if (gone[p] === 0 && near(p)) {
        gone[p] = 1;
        stack[top++] = p;
      }
    };
    for (let x = 0; x < width; x++) {
      push(x);
      push((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
      push(y * width);
      push(y * width + width - 1);
    }
    while (top > 0) {
      const p = stack[--top] as number;
      const x = p % width;
      if (x > 0) push(p - 1);
      if (x < width - 1) push(p + 1);
      if (p >= width) push(p - width);
      if (p < total - width) push(p + width);
    }
  } else {
    for (let p = 0; p < total; p++) if (near(p)) gone[p] = 1;
  }
  const alpha = new Uint8Array(total);
  let removed = 0;
  for (let p = 0; p < total; p++) {
    if (gone[p] === 1) removed++;
    else alpha[p] = rgba[p * 4 + 3] as number;
  }
  boxBlurAlpha(alpha, width, height, Math.round(params.feather));
  for (let p = 0; p < total; p++) {
    // The blur may only lower alpha on pixels that were kept, never bring back removed ones.
    rgba[p * 4 + 3] = gone[p] === 1 ? 0 : Math.min(alpha[p] as number, rgba[p * 4 + 3] as number);
  }
  return removed / total;
}
