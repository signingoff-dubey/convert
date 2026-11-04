import { FileText, FolderOpen, History, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { STRINGS } from '../../../shared/strings';
import { Button } from '../../components/ui';
import { WEDGE_ICONS } from '../../components/icons';
import { invoke, on, previewSrc } from '../../shared/api';

interface Entry {
  id: string;
  name: string;
  dir: string;
  op: string;
  at: number;
  count: number;
  exists: boolean;
  thumb: string;
}

/** "just now", "5 min ago", "yesterday": short and readable. */
export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  const days = Math.round(s / 86_400);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function describe(e: Entry): string {
  const label = STRINGS.toolLabels[e.op];
  return label ?? `Converted to ${e.op.toUpperCase()}`;
}

export function Recent() {
  const [items, setItems] = useState<Entry[] | null>(null);
  const refresh = useCallback(() => void invoke('history:list').then(setItems), []);
  useEffect(() => {
    refresh();
    return on('history:changed', refresh);
  }, [refresh]);

  if (items === null) return null;
  if (items.length === 0) {
    return (
      <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-surface2 text-accent">
          <History size={22} />
        </span>
        <div className="font-medium">Nothing converted yet</div>
        <div className="text-sm text-muted">
          Drag a file, hold Shift+C, and drop it on a format. Your results will be listed here.
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted">
          Your last {items.length} results. Nothing here leaves this PC.
        </p>
        <Button variant="ghost" onClick={() => void invoke('history:clear')}>
          <Trash2 size={14} /> Clear list
        </Button>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {items.map((e) => {
          const Icon = WEDGE_ICONS[e.op] ?? FileText;
          return (
            <li key={e.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface2 text-accent">
                {e.thumb ? (
                  <img src={previewSrc(e.thumb)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon size={18} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate font-medium ${e.exists ? '' : 'text-muted line-through'}`}
                  title={e.name}
                >
                  {e.count > 1 ? `${e.name} and ${e.count - 1} more` : e.name}
                </div>
                <div className="truncate text-sm text-muted" title={e.dir}>
                  {describe(e)} · {ago(e.at)} · {e.exists ? e.dir : 'moved or deleted'}
                </div>
              </div>
              <Button
                disabled={!e.exists}
                onClick={() => void invoke('history:open', { id: e.id })}
              >
                Open
              </Button>
              <Button
                variant="ghost"
                title="Show in folder"
                disabled={!e.exists}
                onClick={() => void invoke('history:reveal', { id: e.id })}
              >
                <FolderOpen size={16} />
              </Button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
