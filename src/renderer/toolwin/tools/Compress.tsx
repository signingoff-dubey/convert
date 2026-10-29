import { useState } from 'react';
import { Field, inputCls, SegmentedControl, Slider } from '../../components/ui';
import { run, ToolFrame, type Params } from '../kit';

export function Compress({ paths }: { paths: string[] }) {
  const [mode, setMode] = useState<'percent' | 'size' | 'preset'>('percent');
  const [percent, setPercent] = useState(50);
  const [sizeKb, setSizeKb] = useState(500);
  const [preset, setPreset] = useState<'small' | 'balanced' | 'high'>('balanced');
  const [resize, setResize] = useState<'none' | '50%' | '75%' | '1080p' | '720p' | 'custom'>(
    'none',
  );
  const [width, setWidth] = useState(1600);
  const params: Params = { mode, percent, sizeKb, preset, resize, width };
  return (
    <ToolFrame
      tool="compress"
      runLabel="Compress"
      canRun={mode !== 'size' || sizeKb >= 1}
      onRun={() => void run('compress', paths, params)}
    >
      <p className="mb-4 text-sm text-muted">
        {paths.length === 1 ? 'Compressing 1 image.' : `Compressing ${paths.length} images.`}{' '}
        Convert never makes a file larger; if it cannot get smaller you will be told.
      </p>
      <Field label="How to compress">
        <SegmentedControl
          label="Mode"
          value={mode}
          options={[
            { value: 'percent', label: 'Reduce by %' },
            { value: 'size', label: 'Target size' },
            { value: 'preset', label: 'Preset' },
          ]}
          onChange={setMode}
        />
      </Field>
      {mode === 'percent' && (
        <Field label="Aim for this share of the original size">
          <Slider
            label="Target percent"
            value={percent}
            min={10}
            max={90}
            format={(v) => `${v}%`}
            onChange={setPercent}
          />
        </Field>
      )}
      {mode === 'size' && (
        <Field label="Target size per image (KB)">
          <input
            type="number"
            min={1}
            className={inputCls}
            value={sizeKb}
            onChange={(e) => setSizeKb(Number(e.target.value))}
          />
        </Field>
      )}
      {mode === 'preset' && (
        <Field
          label="Quality preset"
          hint="Small is the smallest file; High keeps the most detail."
        >
          <SegmentedControl
            label="Preset"
            value={preset}
            options={[
              { value: 'small', label: 'Small' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'high', label: 'High' },
            ]}
            onChange={setPreset}
          />
        </Field>
      )}
      <Field label="Resize while compressing">
        <SegmentedControl
          label="Resize"
          value={resize}
          options={[
            { value: 'none', label: 'Keep size' },
            { value: '75%', label: '75%' },
            { value: '50%', label: '50%' },
            { value: '1080p', label: '1080p' },
            { value: '720p', label: '720p' },
            { value: 'custom', label: 'Width' },
          ]}
          onChange={setResize}
        />
      </Field>
      {resize === 'custom' && (
        <Field label="Width in pixels (never enlarges)">
          <input
            type="number"
            min={16}
            className={inputCls}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </Field>
      )}
    </ToolFrame>
  );
}
