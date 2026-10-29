import { useEffect, useMemo, useRef, useState } from 'react';
import { clampCrop, dragBox, fitRatioBox, type Box, type Handle } from '../../../shared/image-math';
import { Field, inputCls, SegmentedControl } from '../../components/ui';
import { run, ToolFrame, useImage, type LoadedImage } from '../kit';

const RATIOS = [
  ['free', 'Free', null],
  ['1:1', '1:1', 1],
  ['4:3', '4:3', 4 / 3],
  ['3:2', '3:2', 3 / 2],
  ['16:9', '16:9', 16 / 9],
  ['9:16', '9:16', 9 / 16],
] as const;

const HANDLES: [Handle, string][] = [
  ['nw', 'left-0 top-0 cursor-nwse-resize'],
  ['n', 'left-1/2 top-0 cursor-ns-resize'],
  ['ne', 'right-0 top-0 cursor-nesw-resize'],
  ['e', 'right-0 top-1/2 cursor-ew-resize'],
  ['se', 'right-0 bottom-0 cursor-nwse-resize'],
  ['s', 'left-1/2 bottom-0 cursor-ns-resize'],
  ['sw', 'left-0 bottom-0 cursor-nesw-resize'],
  ['w', 'left-0 top-1/2 cursor-ew-resize'],
];

export function Crop({ paths }: { paths: string[] }) {
  const file = paths[0] as string;
  const image = useImage(file);
  const stage = useRef<HTMLDivElement>(null);
  const [ratioKey, setRatioKey] = useState<string>('free');
  const [box, setBox] = useState<Box | null>(null);
  const [exact, setExact] = useState({ w: '', h: '' });
  const drag = useRef<{ handle: Handle; start: Box; x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);

  const natural = image && image !== 'error' ? { w: image.width, h: image.height } : null;
  const ratio = useMemo(() => RATIOS.find((r) => r[0] === ratioKey)?.[2] ?? null, [ratioKey]);

  useEffect(() => {
    if (natural)
      setBox({
        x: Math.round(natural.w * 0.1),
        y: Math.round(natural.h * 0.1),
        w: Math.round(natural.w * 0.8),
        h: Math.round(natural.h * 0.8),
      });
  }, [natural?.w, natural?.h]);
  useEffect(() => {
    if (natural && ratio)
      setBox((b) => {
        const f = fitRatioBox(natural.w, natural.h, ratio);
        const base = b ?? { x: 0, y: 0, w: natural.w, h: natural.h };
        const w = Math.min(f.width, Math.round(base.w));
        return { x: f.left, y: f.top, w, h: Math.round(w / ratio) };
      });
  }, [ratio, natural?.w, natural?.h]);
  useEffect(() => {
    const el = stage.current;
    if (!el || !natural) return;
    const update = () => setScale(el.clientWidth / natural.w);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [natural?.w]);

  if (image === 'error')
    return (
      <ToolFrame tool="crop" canRun={false} onRun={() => undefined}>
        <p className="text-danger">This image could not be previewed.</p>
      </ToolFrame>
    );
  if (!natural || !box)
    return (
      <ToolFrame tool="crop" canRun={false} onRun={() => undefined}>
        <p className="text-sm text-muted">Loading…</p>
      </ToolFrame>
    );

  const onDown = (handle: Handle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { handle, start: box, x: e.clientX, y: e.clientY };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setBox(
      dragBox(
        d.handle,
        d.start,
        (e.clientX - d.x) / scale,
        (e.clientY - d.y) / scale,
        natural,
        ratio,
      ),
    );
  };
  const outW = Number(exact.w);
  const outH = Number(exact.h);
  const exactOn = outW >= 1 && outH >= 1;
  const go = () => {
    const c = clampCrop(
      { left: box.x, top: box.y, width: box.w, height: box.h },
      natural.w,
      natural.h,
    );
    if (!c) return;
    void run('crop', paths, { ...c, ...(exactOn ? { outWidth: outW, outHeight: outH } : {}) });
  };
  const num = (k: keyof Box) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setBox({ ...box, [k]: Math.max(0, Math.round(Number(e.target.value))) });

  return (
    <ToolFrame
      tool="crop"
      runLabel="Crop"
      onRun={go}
      side={
        <>
          <Field label="Shape">
            <SegmentedControl
              label="Aspect ratio"
              value={ratioKey}
              options={RATIOS.map((r) => ({ value: r[0], label: r[1] }))}
              onChange={setRatioKey}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Left">
              <input type="number" className={inputCls} value={box.x} onChange={num('x')} />
            </Field>
            <Field label="Top">
              <input type="number" className={inputCls} value={box.y} onChange={num('y')} />
            </Field>
            <Field label="Width">
              <input type="number" className={inputCls} value={box.w} onChange={num('w')} />
            </Field>
            <Field label="Height">
              <input type="number" className={inputCls} value={box.h} onChange={num('h')} />
            </Field>
          </div>
          <Field
            label="Exact output size (optional)"
            hint="Scales the cropped area to these pixels."
          >
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={1}
                placeholder="Width"
                className={inputCls}
                value={exact.w}
                onChange={(e) => setExact({ ...exact, w: e.target.value })}
              />
              <input
                type="number"
                min={1}
                placeholder="Height"
                className={inputCls}
                value={exact.h}
                onChange={(e) => setExact({ ...exact, h: e.target.value })}
              />
            </div>
          </Field>
          <p className="text-xs text-muted">
            Original: {natural.w} × {natural.h} px
          </p>
        </>
      }
    >
      <div
        ref={stage}
        className="relative mx-auto max-w-full select-none"
        style={{ width: Math.min(natural.w, 640) }}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
      >
        <img
          src={(image as LoadedImage).src}
          alt="Image to crop"
          draggable={false}
          className="block w-full"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-black/55"
          style={{
            clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${(box.x / natural.w) * 100}% ${(box.y / natural.h) * 100}%, ${(box.x / natural.w) * 100}% ${((box.y + box.h) / natural.h) * 100}%, ${((box.x + box.w) / natural.w) * 100}% ${((box.y + box.h) / natural.h) * 100}%, ${((box.x + box.w) / natural.w) * 100}% ${(box.y / natural.h) * 100}%, ${(box.x / natural.w) * 100}% ${(box.y / natural.h) * 100}%)`,
          }}
        />
        <div
          role="group"
          aria-label="Crop area"
          className="absolute cursor-move border-2 border-white"
          style={{
            left: `${(box.x / natural.w) * 100}%`,
            top: `${(box.y / natural.h) * 100}%`,
            width: `${(box.w / natural.w) * 100}%`,
            height: `${(box.h / natural.h) * 100}%`,
            boxShadow: '0 0 0 1px rgba(0,0,0,.5)',
          }}
          onPointerDown={onDown('move')}
        >
          {HANDLES.map(([h, cls]) => (
            <span
              key={h}
              onPointerDown={onDown(h)}
              className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-black/50 bg-white ${cls}`}
            />
          ))}
        </div>
      </div>
    </ToolFrame>
  );
}
