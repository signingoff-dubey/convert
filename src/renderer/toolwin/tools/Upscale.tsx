import { useState } from 'react';
import { Callout, Field, SegmentedControl, Switch } from '../../components/ui';
import { run, ToolFrame, useImage } from '../kit';

export function Upscale({ paths }: { paths: string[] }) {
  const [factor, setFactor] = useState<'2' | '3' | '4'>('2');
  const [sharpen, setSharpen] = useState(true);
  const first = useImage(paths[0] ?? null);
  const n = Number(factor);
  return (
    <ToolFrame
      tool="upscale"
      runLabel={paths.length === 1 ? 'Upscale' : `Upscale ${paths.length} images`}
      onRun={() => void run('upscale', paths, { factor: n, sharpen })}
    >
      <p className="mb-4 text-sm text-muted">
        {paths.length === 1 ? '1 image selected.' : `${paths.length} images selected.`} Each result
        is saved beside its original with the size in its name, such as photo-2x.png.
      </p>
      <Field label="Make it">
        <SegmentedControl
          label="Scale"
          value={factor}
          options={[
            { value: '2', label: '2x' },
            { value: '3', label: '3x' },
            { value: '4', label: '4x' },
          ]}
          onChange={setFactor}
        />
      </Field>
      <label className="mb-3 flex items-center justify-between rounded-lg border border-line bg-surface p-3 text-sm">
        <span>Sharpen a little after enlarging</span>
        <Switch label="Sharpen" checked={sharpen} onChange={setSharpen} />
      </label>
      {first && first !== 'error' && (
        <p className="mb-3 text-sm">
          {first.width} × {first.height} px becomes{' '}
          <strong>
            {first.width * n} × {first.height * n} px
          </strong>
          {paths.length > 1 ? ' (first image)' : ''}.
        </p>
      )}
      <Callout>
        This enlarges with high-quality resampling. It makes pictures bigger and smooth, but it does
        not invent detail the way AI upscalers do.
      </Callout>
    </ToolFrame>
  );
}
