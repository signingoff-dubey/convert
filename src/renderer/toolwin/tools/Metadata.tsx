import { useEffect, useState } from 'react';
import { Button, Callout, Field, inputCls, Switch } from '../../components/ui';
import { invoke } from '../../shared/api';
import { run, ToolFrame, useImage, type Params } from '../kit';

const FIELDS = [
  ['Make', 'Camera make'],
  ['Model', 'Camera model'],
  ['LensModel', 'Lens'],
  ['Artist', 'Author'],
  ['Copyright', 'Copyright'],
  ['ImageDescription', 'Description'],
  ['DateTimeOriginal', 'Date taken (YYYY:MM:DD HH:MM:SS)'],
] as const;

/** exiftool may report a date as ISO text; the editor shows and writes the EXIF form. */
export function toExifDate(value: string): string {
  const m = /^(\d{4})[-:](\d{2})[-:](\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(value);
  return m ? `${m[1]}:${m[2]}:${m[3]} ${m[4]}:${m[5]}:${m[6]}` : value;
}

export function Metadata({ paths }: { paths: string[] }) {
  const file = paths[0] as string;
  const image = useImage(file);
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [removeGps, setRemoveGps] = useState(false);
  const [removeAll, setRemoveAll] = useState(false);

  useEffect(() => {
    void invoke('meta:read', { path: file })
      .then((m) => {
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(m))
          next[k] = k === 'DateTimeOriginal' ? toExifDate(String(v)) : String(v);
        setOriginal(next);
        setValues(next);
      })
      .finally(() => setLoaded(true));
  }, [file]);

  const set = (k: string, v: string) => setValues((x) => ({ ...x, [k]: v }));
  const changed = Object.keys({ ...original, ...values }).filter(
    (k) => (values[k] ?? '') !== (original[k] ?? ''),
  );
  const hasGps = original.GPSLatitude !== undefined;
  const dateOk =
    (values.DateTimeOriginal ?? '') === '' ||
    /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(values.DateTimeOriginal ?? '');
  const canRun = removeAll || removeGps || (changed.length > 0 && dateOk);

  const go = () => {
    const params: Params = {};
    if (removeAll) params.action = 'remove';
    else {
      for (const k of changed) params[`f_${k}`] = values[k] ?? '';
      if (removeGps) params.removeGps = true;
    }
    void run('metadata', paths, params);
  };

  return (
    <ToolFrame
      tool="metadata"
      runLabel={removeAll ? 'Remove all metadata' : 'Save a copy'}
      canRun={canRun}
      onRun={go}
    >
      {image && image !== 'error' && (
        <img src={image.src} alt="" className="mx-auto mb-4 max-h-[150px] rounded-lg" />
      )}
      {!loaded && <p className="text-sm text-muted">Reading metadata…</p>}
      {loaded && Object.keys(original).length === 0 && (
        <Callout>No camera or location tags were found. You can still add some.</Callout>
      )}
      <div className={removeAll ? 'pointer-events-none opacity-40' : ''}>
        <div className="grid grid-cols-2 gap-x-3">
          {FIELDS.map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                className={`${inputCls} ${key === 'DateTimeOriginal' && !dateOk ? 'border-danger' : ''}`}
                value={values[key] ?? ''}
                onChange={(e) => set(key, e.target.value)}
              />
            </Field>
          ))}
          <Field label="Latitude" hint="Decimal degrees; south is negative.">
            <input
              type="number"
              step="any"
              min={-90}
              max={90}
              className={inputCls}
              value={values.GPSLatitude ?? ''}
              onChange={(e) => set('GPSLatitude', e.target.value)}
            />
          </Field>
          <Field label="Longitude" hint="West is negative.">
            <input
              type="number"
              step="any"
              min={-180}
              max={180}
              className={inputCls}
              value={values.GPSLongitude ?? ''}
              onChange={(e) => set('GPSLongitude', e.target.value)}
            />
          </Field>
        </div>
        <label className="mt-1 flex items-center justify-between rounded-lg border border-line bg-surface p-3 text-sm">
          <span>Remove location{hasGps ? '' : ' (none found)'}</span>
          <Switch label="Remove location" checked={removeGps} onChange={setRemoveGps} />
        </label>
      </div>
      <label className="mt-3 flex items-center justify-between rounded-lg border border-line bg-surface p-3 text-sm">
        <span>Remove all metadata instead</span>
        <Switch label="Remove all metadata" checked={removeAll} onChange={setRemoveAll} />
      </label>
      <p className="mt-3 text-xs text-muted">
        Changes are written to a copy named “-metadata”.{' '}
        <Button variant="ghost" onClick={() => setValues(original)}>
          Undo edits
        </Button>
      </p>
    </ToolFrame>
  );
}
