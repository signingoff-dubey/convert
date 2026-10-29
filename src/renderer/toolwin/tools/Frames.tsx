import { useState } from 'react';
import { Field, inputCls, SegmentedControl } from '../../components/ui';
import { run, ToolFrame } from '../kit';

type Preset = '1' | '5' | '10' | 'all' | 'custom';

export function Frames({ paths }: { paths: string[] }) {
  const [preset, setPreset] = useState<Preset>('1');
  const [custom, setCustom] = useState(2);
  const [format, setFormat] = useState<'png' | 'jpg'>('jpg');
  const [max, setMax] = useState(500);
  const every = preset === 'custom' ? custom : preset === 'all' ? 1 : Number(preset);
  const valid = (preset === 'all' || (every >= 0.04 && every <= 3600)) && max >= 1 && max <= 20000;
  return (
    <ToolFrame
      tool="frames"
      runLabel="Extract"
      canRun={valid}
      note="Pictures go into a new folder beside each video. The video is not changed."
      onRun={() =>
        void run('frames', paths, { every, all: preset === 'all', format, max: Math.round(max) })
      }
    >
      <p className="mb-4 text-sm text-muted">
        {paths.length === 1
          ? 'Save still pictures from this video into a folder.'
          : `Save still pictures from ${paths.length} videos, each into its own folder.`}
      </p>
      <Field label="Take a picture">
        <SegmentedControl
          label="Interval"
          value={preset}
          options={[
            { value: '1', label: 'Every second' },
            { value: '5', label: 'Every 5 s' },
            { value: '10', label: 'Every 10 s' },
            { value: 'all', label: 'Every frame' },
            { value: 'custom', label: 'Custom' },
          ]}
          onChange={setPreset}
        />
      </Field>
      {preset === 'custom' && (
        <Field label="Seconds between pictures" hint="From 0.04 to 3600.">
          <input
            type="number"
            min={0.04}
            step={0.5}
            className={inputCls}
            value={custom}
            onChange={(e) => setCustom(Number(e.target.value))}
          />
        </Field>
      )}
      <Field label="Picture format" hint="JPG files are much smaller; PNG keeps every detail.">
        <SegmentedControl
          label="Format"
          value={format}
          options={[
            { value: 'jpg', label: 'JPG' },
            { value: 'png', label: 'PNG' },
          ]}
          onChange={setFormat}
        />
      </Field>
      <Field label="Stop after this many pictures" hint="A safety limit per video.">
        <input
          type="number"
          min={1}
          max={20000}
          className={inputCls}
          value={max}
          onChange={(e) => setMax(Number(e.target.value))}
        />
      </Field>
    </ToolFrame>
  );
}
