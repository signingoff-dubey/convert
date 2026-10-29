import { useState } from 'react';
import { bgLayout, type Ratio } from '../../../shared/image-math';
import { Button, ColorInput, Field, SegmentedControl, Slider } from '../../components/ui';
import { invoke, previewSrc } from '../../shared/api';
import { run, ToolFrame, useImage, type LoadedImage } from '../kit';

const RATIOS: { value: Ratio; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:5', label: '4:5' },
];

export function AddBg({ paths }: { paths: string[] }) {
  const file = paths[0] as string;
  const image = useImage(file);
  const [bg, setBg] = useState<'solid' | 'gradient' | 'image'>('gradient');
  const [color1, setColor1] = useState('#7C5CFF');
  const [color2, setColor2] = useState('#19C3E6');
  const [angle, setAngle] = useState(135);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [ratio, setRatio] = useState<Ratio>('4:3');
  const [padding, setPadding] = useState(10);
  const [radius, setRadius] = useState(8);

  if (!image || image === 'error') {
    return (
      <ToolFrame tool="add-bg" canRun={false} onRun={() => undefined}>
        <p className="text-sm text-muted">
          {image === 'error' ? 'This image could not be previewed.' : 'Loading…'}
        </p>
      </ToolFrame>
    );
  }
  const { width, height } = image as LoadedImage;
  const layout = bgLayout(width, height, ratio, padding);
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  const previewW = 460;
  const scale = previewW / layout.canvasW;
  const background =
    bg === 'solid'
      ? color1
      : bg === 'gradient'
        ? `linear-gradient(${angle}deg, ${color1}, ${color2})`
        : bgImage
          ? `center / cover url(${previewSrc(bgImage)})`
          : '#888';
  const canRun = bg !== 'image' || bgImage !== null;
  return (
    <ToolFrame
      tool="add-bg"
      runLabel="Save a copy"
      canRun={canRun}
      onRun={() =>
        void run('add-bg', paths, {
          bg,
          color1,
          color2,
          angle,
          ...(bgImage ? { bgImage } : {}),
          ratio,
          padding,
          radius,
        })
      }
      side={
        <>
          <Field label="Background">
            <SegmentedControl
              label="Background type"
              value={bg}
              options={[
                { value: 'solid', label: 'Colour' },
                { value: 'gradient', label: 'Gradient' },
                { value: 'image', label: 'Image' },
              ]}
              onChange={setBg}
            />
          </Field>
          {bg !== 'image' && (
            <Field label={bg === 'gradient' ? 'From' : 'Colour'}>
              <ColorInput label="First colour" value={color1} onChange={setColor1} />
            </Field>
          )}
          {bg === 'gradient' && (
            <>
              <Field label="To">
                <ColorInput label="Second colour" value={color2} onChange={setColor2} />
              </Field>
              <Field label="Angle">
                <Slider
                  label="Gradient angle"
                  value={angle}
                  min={0}
                  max={360}
                  format={(v) => `${v}°`}
                  onChange={setAngle}
                />
              </Field>
            </>
          )}
          {bg === 'image' && (
            <Field label="Background image">
              <Button
                onClick={() => void invoke('dialog:pick-image').then((p) => p && setBgImage(p))}
              >
                {bgImage ? 'Choose another…' : 'Choose an image…'}
              </Button>
              {bgImage && (
                <span className="mt-1 block truncate text-xs text-muted">
                  {bgImage.split(/[\\/]/).pop()}
                </span>
              )}
            </Field>
          )}
          <Field label="Shape">
            <SegmentedControl
              label="Aspect ratio"
              value={ratio}
              options={RATIOS}
              onChange={setRatio}
            />
          </Field>
          <Field label="Spacing">
            <Slider
              label="Spacing"
              value={padding}
              min={0}
              max={40}
              format={(v) => `${v}%`}
              onChange={setPadding}
            />
          </Field>
          <Field label="Corner radius">
            <Slider
              label="Corner radius"
              value={radius}
              min={0}
              max={50}
              format={(v) => `${v}%`}
              onChange={setRadius}
            />
          </Field>
        </>
      }
    >
      <div className="grid min-h-[380px] place-items-center rounded-xl bg-black/20 p-4">
        <div
          className="relative overflow-hidden rounded shadow-lg"
          style={{ width: previewW, height: layout.canvasH * scale, background }}
        >
          <img
            src={previewSrc(file)}
            alt="Preview"
            draggable={false}
            className="absolute"
            style={{
              left: pct(layout.photo.x, layout.canvasW),
              top: pct(layout.photo.y, layout.canvasH),
              width: pct(layout.photo.w, layout.canvasW),
              height: pct(layout.photo.h, layout.canvasH),
              borderRadius: (radius / 100) * Math.min(layout.photo.w, layout.photo.h) * scale,
            }}
          />
        </div>
      </div>
    </ToolFrame>
  );
}
