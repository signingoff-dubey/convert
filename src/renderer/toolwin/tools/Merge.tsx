import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { run, ToolFrame } from '../kit';

const base = (p: string): string => p.split(/[\\/]/).pop() ?? p;

export function Merge({ paths }: { paths: string[] }) {
  const [order, setOrder] = useState(paths);
  const move = (i: number, d: number) => {
    const next = [...order];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j] as string, next[i] as string];
    setOrder(next);
  };
  return (
    <ToolFrame tool="merge" runLabel="Merge" onRun={() => void run('merge', order, {})}>
      <p className="mb-3 text-sm text-muted">
        The PDFs are joined in this order. The result is named after the first one.
      </p>
      <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {order.map((p, i) => (
          <li key={p} className="flex items-center gap-3 px-3 py-2">
            <span className="w-6 text-sm text-muted">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm" title={p}>
              {base(p)}
            </span>
            <Button variant="ghost" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp size={14} />
            </Button>
            <Button
              variant="ghost"
              title="Move down"
              disabled={i === order.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown size={14} />
            </Button>
          </li>
        ))}
      </ol>
    </ToolFrame>
  );
}
