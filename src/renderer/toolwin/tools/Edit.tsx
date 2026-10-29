import { FlipHorizontal, FlipVertical, RotateCcw, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_EDIT, editToCssFilter, type EditParams } from '../../../shared/image-math';
import { Button, Field, Slider, Switch } from '../../components/ui';
import { previewSrc } from '../../shared/api';
import { run, ToolFrame, type Params } from '../kit';

const SLIDERS: [keyof EditParams, string, number, number][] = [
  ['exposure', 'Exposure', -100, 100],
  ['contrast', 'Contrast', -100, 100],
  ['saturation', 'Saturation', -100, 100],
  ['temperature', 'Warmth', -100, 100],
  ['sharpen', 'Sharpen', 0, 100],
  ['blur', 'Blur', 0, 20],
];

export function Edit({ paths }: { paths: string[] }) {
  const file = paths[0] as string;
  const [e, setE] = useState<EditParams>(DEFAULT_EDIT);
  const dirty = JSON.stringify(e) !== JSON.stringify(DEFAULT_EDIT);
  const turn = (d: number) =>
    setE((x) => ({ ...x, rotate: ((((x.rotate + d) % 360) + 360) % 360) as EditParams['rotate'] }));
  const transform = `rotate(${e.rotate}deg) scale(${e.flipH ? -1 : 1}, ${e.flipV ? -1 : 1})`;
  const rotated = e.rotate === 90 || e.rotate === 270;
  return (
    <ToolFrame
      tool="edit"
      runLabel="Save a copy"
      canRun={dirty}
      onRun={() => void run('edit', paths, { ...e } as unknown as Params)}
      note="The preview is close to the saved result; the saved copy is made at full resolution."
      side={
        <>
          {SLIDERS.map(([key, label, min, max]) => (
            <Field key={key} label={label}>
              <Slider
                label={label}
                value={e[key] as number}
                min={min}
                max={max}
                onChange={(v) => setE((x) => ({ ...x, [key]: v }))}
              />
            </Field>
          ))}
          <div className="mb-3 flex items-center justify-between text-sm">
            <span>Black and white</span>
            <Switch
              label="Black and white"
              checked={e.grayscale}
              onChange={(v) => setE((x) => ({ ...x, grayscale: v, sepia: v ? false : x.sepia }))}
            />
          </div>
          <div className="mb-3 flex items-center justify-between text-sm">
            <span>Sepia</span>
            <Switch
              label="Sepia"
              checked={e.sepia}
              onChange={(v) =>
                setE((x) => ({ ...x, sepia: v, grayscale: v ? false : x.grayscale }))
              }
            />
          </div>
          <div className="mb-3 flex gap-1">
            <Button title="Rotate left" onClick={() => turn(-90)}>
              <RotateCcw size={14} />
            </Button>
            <Button title="Rotate right" onClick={() => turn(90)}>
              <RotateCw size={14} />
            </Button>
            <Button
              title="Flip horizontally"
              onClick={() => setE((x) => ({ ...x, flipH: !x.flipH }))}
            >
              <FlipHorizontal size={14} />
            </Button>
            <Button
              title="Flip vertically"
              onClick={() => setE((x) => ({ ...x, flipV: !x.flipV }))}
            >
              <FlipVertical size={14} />
            </Button>
          </div>
          <Button variant="ghost" onClick={() => setE(DEFAULT_EDIT)}>
            Reset all
          </Button>
        </>
      }
    >
      <div className="grid h-full min-h-[360px] place-items-center overflow-hidden rounded-xl bg-black/30">
        <img
          src={previewSrc(file)}
          alt="Preview"
          draggable={false}
          style={{
            filter: editToCssFilter(e),
            transform,
            maxWidth: rotated ? '60%' : '100%',
            maxHeight: rotated ? '100%' : '560px',
            transition: 'filter 60ms linear',
          }}
        />
      </div>
    </ToolFrame>
  );
}
