import { useEffect, useRef, useState } from 'react';
import { categoryOf } from '../../../shared/formats';
import { Button, Field, inputCls } from '../../components/ui';
import { invoke, previewSrc } from '../../shared/api';
import { fmtTime, parseTime, run, ToolFrame } from '../kit';

export function Trim({ paths }: { paths: string[] }) {
  const file = paths[0] as string;
  const isVideo = categoryOf(file) === 'video';
  const [duration, setDuration] = useState<number | null>(null);
  const [start, setStart] = useState('0:00.0');
  const [end, setEnd] = useState('');
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);

  useEffect(() => {
    void invoke('toolwin:probe', { path: file }).then((r) => {
      setDuration(r.durationSec);
      if (r.durationSec) setEnd(fmtTime(r.durationSec));
    });
  }, [file]);

  const s = parseTime(start);
  const e = parseTime(end);
  const valid = s !== null && e !== null && e > s && (duration === null || e <= duration + 0.5);
  const at = (set: (v: string) => void) => set(fmtTime(media.current?.currentTime ?? 0));
  return (
    <ToolFrame
      tool="trim"
      runLabel="Trim"
      canRun={valid}
      onRun={() => void run('trim', paths, { start: s ?? 0, end: e ?? 0 })}
    >
      {isVideo ? (
        <video
          ref={media}
          src={previewSrc(file)}
          controls
          className="mb-4 max-h-[280px] w-full rounded-lg bg-black"
        />
      ) : (
        <audio ref={media} src={previewSrc(file)} controls className="mb-4 w-full" />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start" hint="minutes:seconds, for example 1:05.5">
          <input
            className={`${inputCls} ${s === null ? 'border-danger' : ''}`}
            value={start}
            onChange={(ev) => setStart(ev.target.value)}
          />
          <span className="mt-1 block">
            <Button variant="ghost" onClick={() => at(setStart)}>
              Use current position
            </Button>
          </span>
        </Field>
        <Field label="End" hint={duration ? `Length ${fmtTime(duration)}` : undefined}>
          <input
            className={`${inputCls} ${e === null || (s !== null && e <= s) ? 'border-danger' : ''}`}
            value={end}
            onChange={(ev) => setEnd(ev.target.value)}
          />
          <span className="mt-1 block">
            <Button variant="ghost" onClick={() => at(setEnd)}>
              Use current position
            </Button>
          </span>
        </Field>
      </div>
      {!valid && (
        <p className="text-sm text-danger">The end must be after the start and inside the file.</p>
      )}
    </ToolFrame>
  );
}
