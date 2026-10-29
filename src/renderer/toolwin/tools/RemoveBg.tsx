import { useEffect, useRef, useState } from 'react';
import { DEFAULT_BG, removeBackground } from '../../../shared/bg-remove';
import { Button, Callout, Field, Slider, Switch } from '../../components/ui';
import { run, ToolFrame, useImage } from '../kit';

const PREVIEW_SIDE = 560;
const hex = (c: readonly [number, number, number]): string =>
  `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

export function RemoveBg({ paths }: { paths: string[] }) {
  const img = useImage(paths[0] ?? null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tolerance, setTolerance] = useState(DEFAULT_BG.tolerance);
  const [feather, setFeather] = useState(DEFAULT_BG.feather);
  const [contiguous, setContiguous] = useState(true);
  const [color, setColor] = useState<[number, number, number] | null>(null);
  const [removed, setRemoved] = useState<number | null>(null);
  const loaded = img && img !== 'error' ? img : null;

  useEffect(() => {
    const target = canvas.current;
    if (!loaded || !target) return;
    // The preview works on a reduced copy; the saved file uses the full picture and the same code.
    const scale = Math.min(1, PREVIEW_SIDE / Math.max(loaded.width, loaded.height));
    const w = Math.max(1, Math.round(loaded.width * scale));
    const h = Math.max(1, Math.round(loaded.height * scale));
    target.width = w;
    target.height = h;
    const ctx = target.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(loaded.el, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    setRemoved(
      removeBackground(data.data, w, h, {
        tolerance,
        feather: Math.round(feather * scale),
        color,
        contiguous,
      }),
    );
    ctx.putImageData(data, 0, 0);
  }, [loaded, tolerance, feather, contiguous, color]);

  const pick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!loaded) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sample = document.createElement('canvas');
    sample.width = e.currentTarget.width;
    sample.height = e.currentTarget.height;
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(loaded.el, 0, 0, sample.width, sample.height);
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * sample.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * sample.height);
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
    setColor([r as number, g as number, b as number]);
  };

  const params = {
    tolerance,
    feather,
    contiguous,
    ...(color ? { color: hex(color) } : {}),
  };
  return (
    <ToolFrame
      tool="remove-bg"
      runLabel={paths.length === 1 ? 'Remove background' : `Remove from ${paths.length} images`}
      canRun={removed === null || removed >= 0.001}
      note="Results are PNG files saved beside the originals."
      onRun={() => void run('remove-bg', paths, params)}
      side={
        <>
          <Field label="Tolerance" hint="Higher removes colours that are less like the background.">
            <Slider label="Tolerance" value={tolerance} min={1} max={60} onChange={setTolerance} />
          </Field>
          <Field label="Soft edge" hint="Blurs the cut a little so it does not look jagged.">
            <Slider
              label="Soft edge"
              value={feather}
              min={0}
              max={6}
              format={(v) => `${v}px`}
              onChange={setFeather}
            />
          </Field>
          <label className="mb-3 flex items-center justify-between text-sm">
            <span>Only the part touching the edge</span>
            <Switch label="Contiguous" checked={contiguous} onChange={setContiguous} />
          </label>
          <Field
            label="Background colour"
            hint={
              color
                ? `Using ${hex(color)}. Click the picture to choose another.`
                : 'Found from the picture’s edge. Click the picture to choose it yourself.'
            }
          >
            {color && <Button onClick={() => setColor(null)}>Find it automatically</Button>}
          </Field>
        </>
      }
    >
      {paths.length > 1 && (
        <p className="mb-3 text-sm text-muted">
          The first of {paths.length} images is shown. The same settings are used for all of them.
        </p>
      )}
      {removed !== null && removed < 0.001 && (
        <Callout tone="warning">
          No plain background was found. Raise the tolerance or click the background to pick it.
        </Callout>
      )}
      <div
        className="flex items-center justify-center rounded-xl border border-line p-2"
        style={{
          backgroundImage:
            'conic-gradient(#8884 25%, transparent 0 50%, #8884 0 75%, transparent 0)',
          backgroundSize: '16px 16px',
        }}
      >
        {img === 'error' ? (
          <span className="text-sm text-danger">This picture could not be opened.</span>
        ) : (
          <canvas
            ref={canvas}
            onClick={pick}
            className="max-h-[480px] max-w-full cursor-crosshair"
            aria-label="Preview with the background removed"
          />
        )}
      </div>
      <Callout>
        This works on plain backgrounds, such as a studio wall, a white page or a flat colour. It
        does not recognise people or objects, so a busy background will not come out cleanly.
      </Callout>
    </ToolFrame>
  );
}
