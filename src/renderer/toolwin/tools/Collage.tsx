import { ArrowDown, ArrowUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { collageLayout, type CollageStyle } from '../../../shared/image-math';
import { Button, ColorInput, Field, SegmentedControl, Slider } from '../../components/ui';
import { previewSrc } from '../../shared/api';
import { run, ToolFrame } from '../kit';

const base = (p: string): string => p.split(/[\\/]/).pop() ?? p;
const WIDTH = 2400;

function useAspects(paths: string[]): Record<string, number> {
  const [aspects, setAspects] = useState<Record<string, number>>({});
  useEffect(() => {
    for (const p of paths) {
      const img = new Image();
      img.onload = () => setAspects((a) => ({ ...a, [p]: img.naturalWidth / img.naturalHeight }));
      img.src = previewSrc(p);
    }
  }, [paths]);
  return aspects;
}

export function Collage({ paths }: { paths: string[] }) {
  const [order, setOrder] = useState(paths);
  const [layout, setLayout] = useState<CollageStyle>('grid');
  const [spacing, setSpacing] = useState(16);
  const [radius, setRadius] = useState(12);
  const [color, setColor] = useState('#FFFFFF');
  const [format, setFormat] = useState<'png' | 'jpg'>('png');
  const aspects = useAspects(paths);
  const ready = order.every((p) => aspects[p] !== undefined);
  const plan = useMemo(
    () =>
      collageLayout(
        layout,
        order.map((p) => aspects[p] ?? 1),
        WIDTH,
        spacing,
      ),
    [layout, order, aspects, spacing],
  );
  const move = (i: number, d: number) => {
    const next = [...order];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j] as string, next[i] as string];
    setOrder(next);
  };
  const previewW = 480;
  const k = previewW / plan.width;
  return (
    <ToolFrame
      tool="collage"
      runLabel="Make collage"
      canRun={ready}
      onRun={() =>
        void run('collage', order, { layout, spacing, radius, color1: color, width: WIDTH, format })
      }
      side={
        <>
          <Field label="Layout">
            <SegmentedControl
              label="Layout"
              value={layout}
              options={[
                { value: 'grid', label: 'Grid' },
                { value: 'row', label: 'Row' },
                { value: 'column', label: 'Column' },
                { value: 'featured', label: 'Featured' },
              ]}
              onChange={setLayout}
            />
          </Field>
          <Field label="Spacing">
            <Slider
              label="Spacing"
              value={spacing}
              min={0}
              max={80}
              format={(v) => `${v}px`}
              onChange={setSpacing}
            />
          </Field>
          <Field label="Corner radius">
            <Slider
              label="Corner radius"
              value={radius}
              min={0}
              max={120}
              format={(v) => `${v}px`}
              onChange={setRadius}
            />
          </Field>
          <Field label="Background">
            <ColorInput label="Background colour" value={color} onChange={setColor} />
          </Field>
          <Field label="Save as">
            <SegmentedControl
              label="Format"
              value={format}
              options={[
                { value: 'png', label: 'PNG' },
                { value: 'jpg', label: 'JPG' },
              ]}
              onChange={setFormat}
            />
          </Field>
          <Field label="Order">
            <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {order.map((p, i) => (
                <li key={p} className="flex items-center gap-1 px-2 py-1 text-xs">
                  <span className="w-4 text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{base(p)}</span>
                  <Button
                    variant="ghost"
                    disabled={i === 0}
                    title="Move up"
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp size={12} />
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={i === order.length - 1}
                    title="Move down"
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown size={12} />
                  </Button>
                </li>
              ))}
            </ol>
          </Field>
        </>
      }
    >
      <div className="grid min-h-[380px] place-items-center rounded-xl bg-black/20 p-4">
        <div
          className="relative overflow-hidden shadow-lg"
          style={{ width: previewW, height: plan.height * k, background: color }}
        >
          {plan.cells.map((c, i) => (
            <div
              key={order[i]}
              className="absolute bg-cover bg-center"
              style={{
                left: c.x * k,
                top: c.y * k,
                width: c.w * k,
                height: c.h * k,
                borderRadius: Math.min(radius, Math.min(c.w, c.h) / 2) * k,
                backgroundImage: `url(${previewSrc(order[i] as string)})`,
              }}
            />
          ))}
        </div>
      </div>
    </ToolFrame>
  );
}
