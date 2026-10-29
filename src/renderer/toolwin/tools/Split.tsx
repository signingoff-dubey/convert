import { useEffect, useState } from 'react';
import { Field, inputCls, Switch } from '../../components/ui';
import { invoke } from '../../shared/api';
import { run, ToolFrame } from '../kit';

export function Split({ paths }: { paths: string[] }) {
  const file = paths[0] as string;
  const [pages, setPages] = useState<number | null>(null);
  const [ranges, setRanges] = useState('1-2, 5');
  const [every, setEvery] = useState(false);
  useEffect(
    () => void invoke('toolwin:probe', { path: file }).then((r) => setPages(r.pages)),
    [file],
  );
  const valid = every || (/^[\d\s,-]+$/.test(ranges.trim()) && ranges.trim() !== '');
  return (
    <ToolFrame
      tool="split"
      runLabel="Split"
      canRun={valid}
      onRun={() => void run('split', paths, { ranges, every })}
    >
      <p className="mb-4 text-sm text-muted">
        {pages ? `This PDF has ${pages} pages.` : 'Reading the PDF…'} Each range becomes its own PDF
        inside a new folder.
      </p>
      <label className="mb-3 flex items-center justify-between rounded-lg border border-line bg-surface p-3 text-sm">
        <span>One file per page</span>
        <Switch label="One file per page" checked={every} onChange={setEvery} />
      </label>
      {!every && (
        <Field
          label="Page ranges"
          hint="For example 1-3, 5, 8- (to the end). Ranges outside the document are not allowed."
        >
          <input
            className={`${inputCls} ${valid ? '' : 'border-danger'}`}
            value={ranges}
            onChange={(e) => setRanges(e.target.value)}
          />
        </Field>
      )}
    </ToolFrame>
  );
}
