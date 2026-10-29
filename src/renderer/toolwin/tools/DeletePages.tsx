import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout } from '../../components/ui';
import { invoke } from '../../shared/api';
import { run, ToolFrame } from '../kit';

const BATCH = 12;
const WIDTH = 220;

/** [1,2,3,5] becomes "1-3,5". */
export function rangesOf(pages: readonly number[]): string {
  const sorted = [...pages].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && (sorted[j + 1] as number) === (sorted[j] as number) + 1) j++;
    out.push(i === j ? `${sorted[i]}` : `${sorted[i]}-${sorted[j]}`);
    i = j + 1;
  }
  return out.join(',');
}

export function DeletePages({ paths }: { paths: string[] }) {
  const file = paths[0] as string;
  const [total, setTotal] = useState<number | null>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const made = useRef<string[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        let from = 1;
        let pages = Infinity;
        while (alive && from <= pages) {
          const r = await invoke('pdf:thumbs', { path: file, from, count: BATCH, width: WIDTH });
          if (!alive) return;
          if (pages === Infinity) {
            pages = r.pages;
            setTotal(r.pages);
            setKeep(new Set(Array.from({ length: r.pages }, (_, i) => i + 1)));
          }
          const fresh = r.thumbs.map((t) => {
            const url = URL.createObjectURL(new Blob([t.slice().buffer], { type: 'image/png' }));
            made.current.push(url);
            return url;
          });
          setUrls((u) => [...u, ...fresh]);
          from += BATCH;
        }
      } catch (e) {
        if (alive)
          setError(
            /password|encrypt/i.test(String(e))
              ? 'This PDF has a password. Remove it first with Tools, then Password.'
              : 'The pages could not be shown. The file may be damaged.',
          );
      }
    })();
    return () => {
      alive = false;
      made.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [file]);

  const toggle = (n: number): void =>
    setKeep((k) => {
      const next = new Set(k);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  const all = useMemo(() => Array.from({ length: total ?? 0 }, (_, i) => i + 1), [total]);
  const removed = (total ?? 0) - keep.size;
  return (
    <ToolFrame
      tool="delete-pages"
      runLabel="Save new PDF"
      canRun={total !== null && keep.size > 0 && removed > 0}
      note="Your original is never changed. The pages you keep are saved as a new PDF."
      onRun={() => void run('delete-pages', paths, { keep: rangesOf([...keep]) })}
    >
      {error ? (
        <Callout tone="danger">{error}</Callout>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              {total === null
                ? 'Reading the PDF…'
                : `Keeping ${keep.size} of ${total} pages. Click a page to remove or keep it.`}
            </p>
            <span className="flex gap-2">
              <Button onClick={() => setKeep(new Set(all))}>Select all</Button>
              <Button onClick={() => setKeep(new Set())}>Select none</Button>
              <Button onClick={() => setKeep(new Set(all.filter((n) => !keep.has(n))))}>
                Invert
              </Button>
            </span>
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
            {all.map((n) => {
              const on = keep.has(n);
              const url = urls[n - 1];
              return (
                <li key={n}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`Page ${n}, ${on ? 'kept' : 'removed'}`}
                    onClick={() => toggle(n)}
                    className={`relative block w-full rounded-lg border-2 bg-surface p-1 text-left ${
                      on ? 'border-accent' : 'border-line opacity-50'
                    }`}
                  >
                    {url ? (
                      <img src={url} alt="" className="block w-full rounded bg-white" />
                    ) : (
                      <span className="block aspect-[3/4] animate-pulse rounded bg-surface2" />
                    )}
                    <span
                      className={`absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded text-xs font-bold ${
                        on ? 'bg-accent text-white' : 'bg-surface2 text-muted'
                      }`}
                    >
                      {on ? '✓' : ''}
                    </span>
                    <span className="mt-1 block text-center text-xs text-muted">{n}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </ToolFrame>
  );
}
