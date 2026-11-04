import { ArrowLeft, ArrowRight, RotateCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, inputCls, Switch } from '../../components/ui';
import { invoke } from '../../shared/api';
import { run, ToolFrame } from '../kit';

const BATCH = 12;
const WIDTH = 220;

interface Item {
  /** One-based page of the original. */
  page: number;
  /** Extra clockwise turn in degrees. */
  rot: number;
  keep: boolean;
}

/** [3,1,2] with a turn on page 1 becomes "3,1r90,2". */
export function orderOf(items: readonly Item[]): string {
  return items
    .filter((i) => i.keep)
    .map((i) => `${i.page}${i.rot ? `r${i.rot}` : ''}`)
    .join(',');
}

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

/** The PDF page editor: remove, turn and reorder pages, add a watermark or page numbers, save a new PDF. */
export function DeletePages({ paths }: { paths: string[] }) {
  const file = paths[0] as string;
  const [total, setTotal] = useState<number | null>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [watermark, setWatermark] = useState('');
  const [numbers, setNumbers] = useState(false);
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
            setItems(
              Array.from({ length: r.pages }, (_, i) => ({ page: i + 1, rot: 0, keep: true })),
            );
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

  const patch = (at: number, change: Partial<Item>): void =>
    setItems((list) => list.map((it, i) => (i === at ? { ...it, ...change } : it)));
  const move = (at: number, by: number): void =>
    setItems((list) => {
      const to = at + by;
      if (to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[at], next[to]] = [next[to] as Item, next[at] as Item];
      return next;
    });

  const kept = items.filter((i) => i.keep);
  const stamp = watermark.trim() !== '' || numbers;
  const changed = useMemo(
    () =>
      items.length > 0 &&
      (kept.length !== items.length || items.some((it, i) => it.page !== i + 1 || it.rot !== 0)),
    [items, kept.length],
  );
  return (
    <ToolFrame
      tool="delete-pages"
      runLabel="Save new PDF"
      canRun={total !== null && kept.length > 0 && (changed || stamp)}
      note="Your original is never changed. The result is saved beside it as a new PDF."
      onRun={() =>
        void run('delete-pages', paths, {
          order: orderOf(items),
          watermark: watermark.trim(),
          pageNumbers: numbers,
        })
      }
      side={
        <>
          <label className="mb-1 block text-sm font-medium" htmlFor="wm">
            Watermark
          </label>
          <input
            id="wm"
            className={inputCls}
            placeholder="For example DRAFT"
            maxLength={80}
            value={watermark}
            onChange={(e) => setWatermark(e.target.value)}
          />
          <p className="mb-4 mt-1 text-xs text-muted">
            Diagonal, light grey, on every page. Latin letters only.
          </p>
          <label className="flex items-center justify-between text-sm">
            <span>Add page numbers</span>
            <Switch label="Add page numbers" checked={numbers} onChange={setNumbers} />
          </label>
          <p className="mb-4 mt-1 text-xs text-muted">Small “3 / 12” at the bottom centre.</p>
          <div className="text-sm text-muted">
            {total === null ? 'Reading the PDF…' : `Keeping ${kept.length} of ${total} pages.`}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => setItems((l) => l.map((i) => ({ ...i, keep: true })))}>
              All
            </Button>
            <Button onClick={() => setItems((l) => l.map((i) => ({ ...i, keep: false })))}>
              None
            </Button>
            <Button onClick={() => setItems((l) => l.map((i) => ({ ...i, keep: !i.keep })))}>
              Invert
            </Button>
            <Button
              onClick={() =>
                setItems((l) =>
                  [...l].sort((a, b) => a.page - b.page).map((i) => ({ ...i, rot: 0 })),
                )
              }
            >
              Reset order
            </Button>
          </div>
        </>
      }
    >
      {error ? (
        <Callout tone="danger">{error}</Callout>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            Click a page to remove or keep it. Use the arrows to move a page and the turn button to
            rotate it.
          </p>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
            {items.map((it, at) => {
              const url = urls[it.page - 1];
              return (
                <li key={it.page}>
                  <div
                    className={`rounded-lg border-2 bg-surface p-1 ${it.keep ? 'border-accent' : 'border-line opacity-50'}`}
                  >
                    <button
                      type="button"
                      aria-pressed={it.keep}
                      aria-label={`Page ${it.page}, ${it.keep ? 'kept' : 'removed'}`}
                      onClick={() => patch(at, { keep: !it.keep })}
                      className="relative grid aspect-[3/4] w-full place-items-center overflow-hidden rounded bg-white"
                    >
                      {url ? (
                        <img
                          src={url}
                          alt=""
                          className="max-h-full max-w-full transition-transform"
                          style={{ transform: `rotate(${it.rot}deg)` }}
                        />
                      ) : (
                        <span className="h-full w-full animate-pulse bg-surface2" />
                      )}
                      <span
                        className={`absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded text-xs font-bold ${
                          it.keep ? 'bg-accent text-white' : 'bg-surface2 text-muted'
                        }`}
                      >
                        {it.keep ? '✓' : ''}
                      </span>
                    </button>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted">
                      <button
                        type="button"
                        aria-label={`Move page ${it.page} earlier`}
                        disabled={at === 0}
                        onClick={() => move(at, -1)}
                        className="rounded p-1 hover:bg-surface2 disabled:opacity-30"
                      >
                        <ArrowLeft size={14} />
                      </button>
                      <span>{it.page}</span>
                      <button
                        type="button"
                        aria-label={`Turn page ${it.page}`}
                        onClick={() => patch(at, { rot: (it.rot + 90) % 360 })}
                        className="rounded p-1 hover:bg-surface2"
                      >
                        <RotateCw size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move page ${it.page} later`}
                        disabled={at === items.length - 1}
                        onClick={() => move(at, 1)}
                        className="rounded p-1 hover:bg-surface2 disabled:opacity-30"
                      >
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </ToolFrame>
  );
}
