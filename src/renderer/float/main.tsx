import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Move,
  Trash2,
  X,
} from 'lucide-react';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, on } from '../shared/api';
import { useSettings } from '../shared/store';
import '../theme/tokens.css';

type Edge = 'free' | 'left' | 'right' | 'top' | 'bottom';
interface Item {
  path: string;
  name: string;
}

function App() {
  const init = useSettings((s) => s.init);
  const [items, setItems] = useState<Item[]>([]);
  const [edge, setEdge] = useState<Edge>('right');
  useEffect(() => {
    void init();
    void invoke('float:list').then(setItems);
    void invoke('float:state').then((s) => setEdge(s.edge));
    return on<Item[]>('float:changed', setItems);
  }, [init]);
  const horizontal = edge === 'top' || edge === 'bottom';
  const dock = (e: Edge) => {
    setEdge(e);
    void invoke('float:dock', { edge: e });
  };
  const btn = (e: Edge, Icon: typeof Move, label: string) => (
    <button
      key={e}
      aria-label={label}
      aria-pressed={edge === e}
      title={label}
      onClick={() => dock(e)}
      className={`rounded p-1 ${edge === e ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'}`}
    >
      <Icon size={14} />
    </button>
  );
  return (
    <div className="flex h-full flex-col border border-line bg-bg">
      <div className="drag-region flex items-center justify-between gap-1 border-b border-line px-2 py-1.5 text-xs text-muted">
        <span className="font-medium">Float</span>
        <span className="no-drag flex items-center">
          {btn('left', ArrowLeftToLine, 'Pin to left edge')}
          {btn('top', ArrowUpToLine, 'Pin to top edge')}
          {btn('bottom', ArrowDownToLine, 'Pin to bottom edge')}
          {btn('right', ArrowRightToLine, 'Pin to right edge')}
          {btn('free', Move, 'Unpin')}
          <button
            aria-label="Clear shelf"
            title="Clear shelf"
            onClick={() => void invoke('float:clear')}
            className="rounded p-1 text-muted hover:text-ink"
          >
            <Trash2 size={14} />
          </button>
          <button
            aria-label="Close shelf"
            title="Close"
            onClick={() => void invoke('float:close')}
            className="rounded p-1 text-muted hover:text-ink"
          >
            <X size={14} />
          </button>
        </span>
      </div>
      {items.length === 0 ? (
        <p className="m-auto px-3 text-center text-xs text-muted">
          Drop a file on the Float wedge to keep it here, then drag it into any app.
        </p>
      ) : (
        <ul
          className={`flex flex-1 gap-2 overflow-auto p-2 ${horizontal ? 'flex-row' : 'flex-col'}`}
        >
          {items.map((i) => (
            <li key={i.path} className="group relative shrink-0">
              <div
                draggable
                onDragStart={(e) => {
                  e.preventDefault();
                  void invoke('float:drag', { path: i.path });
                }}
                title={i.path}
                className="flex w-[104px] cursor-grab flex-col items-center rounded-lg border border-line bg-surface px-2 py-1.5 text-center hover:border-accent"
              >
                <span className="w-full truncate text-xs">{i.name}</span>
                <span className="text-[10px] text-muted">drag out</span>
              </div>
              <button
                aria-label={`Remove ${i.name}`}
                onClick={() => void invoke('float:remove', { path: i.path })}
                className="absolute -right-1 -top-1 hidden rounded-full border border-line bg-surface p-0.5 text-muted group-hover:block"
              >
                <X size={10} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
