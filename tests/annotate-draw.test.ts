import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { drawAll, drawShape, type Shape } from '../src/renderer/toolwin/annotate-draw';

const base: Shape = { kind: 'rect', color: '#ff0000', width: 6, x1: 20, y1: 20, x2: 80, y2: 60 };
function render(shapes: Shape[]) {
  const canvas = createCanvas(120, 100);
  const ctx = canvas.getContext('2d');
  drawAll(ctx as never, shapes);
  return (x: number, y: number) =>
    [...ctx.getImageData(x, y, 1, 1).data] as [number, number, number, number];
}

describe('annotation drawing', () => {
  it('draws a rectangle outline but leaves the inside empty', () => {
    const px = render([base]);
    expect(px(20, 40)[3]).toBeGreaterThan(200); // on the left edge
    expect(px(50, 40)[3]).toBe(0); // inside
    expect(px(110, 90)[3]).toBe(0); // outside
  });
  it('draws a line and an arrow with a filled head', () => {
    const line = render([{ ...base, kind: 'line', x1: 10, y1: 50, x2: 100, y2: 50 }]);
    expect(line(50, 50)[3]).toBeGreaterThan(200);
    const arrow = render([{ ...base, kind: 'arrow', x1: 10, y1: 50, x2: 100, y2: 50 }]);
    expect(arrow(92, 53)[3]).toBeGreaterThan(100); // inside the head
  });
  it('draws an ellipse through its extremes', () => {
    const px = render([{ ...base, kind: 'ellipse' }]);
    expect(px(20, 40)[3]).toBeGreaterThan(100);
    expect(px(50, 40)[3]).toBe(0);
  });
  it('draws a numbered callout as a filled disc', () => {
    const px = render([{ ...base, kind: 'callout', x1: 60, y1: 50, n: 3 }]);
    expect(px(60 - 14, 50)[3]).toBeGreaterThan(200);
    expect(px(110, 10)[3]).toBe(0);
  });
  it('draws text with fill and outline', () => {
    const px = render([{ ...base, kind: 'text', x1: 10, y1: 10, text: 'Hi', width: 6 }]);
    let drawn = 0;
    for (let x = 10; x < 60; x++) for (let y = 10; y < 45; y++) if (px(x, y)[3] > 0) drawn++;
    expect(drawn).toBeGreaterThan(30);
  });
  it('leaves the context state clean after each shape', () => {
    const canvas = createCanvas(10, 10);
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 3;
    drawShape(ctx as never, { ...base, width: 9 });
    expect(ctx.lineWidth).toBe(3);
  });
});
