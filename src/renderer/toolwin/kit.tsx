import { X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { ToolWindowName } from '../../shared/ipc';
import { Button } from '../components/ui';
import { invoke, previewSrc } from '../shared/api';

export const TITLES: Record<ToolWindowName, string> = {
  trim: 'Trim',
  split: 'Split pages',
  merge: 'Merge files',
  compress: 'Compress images',
  redact: 'Redact photo',
  metadata: 'Edit metadata',
  edit: 'Edit photo',
  crop: 'Crop image',
  'add-bg': 'Add a background',
  annotate: 'Annotate photo',
  collage: 'Make a collage',
  frames: 'Extract frames',
  'delete-pages': 'Delete pages',
  upscale: 'Upscale images',
  'remove-bg': 'Remove background',
  password: 'Password',
};

export type Params = Record<string, string | number | boolean>;

/** Window chrome, title bar and footer shared by every tool window (frameless, themed). */
export function ToolFrame({
  tool,
  runLabel = 'Run',
  canRun = true,
  busy = false,
  onRun,
  children,
  side,
  note,
}: {
  tool: ToolWindowName;
  runLabel?: string;
  canRun?: boolean;
  busy?: boolean;
  onRun: () => void;
  children: ReactNode;
  side?: ReactNode;
  note?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && void invoke('toolwin:close');
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="drag-region flex h-10 shrink-0 items-center justify-between border-b border-line px-4">
        <span className="text-sm font-semibold">{TITLES[tool]}</span>
        <button
          aria-label="Close"
          className="no-drag rounded p-1 text-muted hover:bg-surface2 hover:text-ink"
          onClick={() => void invoke('toolwin:close')}
        >
          <X size={16} />
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto p-4">{children}</div>
        {side && (
          <aside className="w-[290px] shrink-0 overflow-auto border-l border-line bg-surface p-4">
            {side}
          </aside>
        )}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-4 py-3">
        <span className="text-xs text-muted">
          {note ?? 'Your original is never changed. The result is saved beside it.'}
        </span>
        <span className="flex gap-2">
          <Button onClick={() => void invoke('toolwin:close')}>Cancel</Button>
          <Button variant="primary" disabled={!canRun || busy} onClick={onRun}>
            {busy ? 'Working…' : runLabel}
          </Button>
        </span>
      </footer>
    </div>
  );
}

export interface LoadedImage {
  el: HTMLImageElement;
  width: number;
  height: number;
  src: string;
}

/** Loads a preview with CORS enabled, so canvases can read and export pixels. */
export function useImage(path: string | null): LoadedImage | null | 'error' {
  const [state, setState] = useState<LoadedImage | null | 'error'>(null);
  useEffect(() => {
    if (!path) return;
    setState(null);
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () =>
      setState({ el, width: el.naturalWidth, height: el.naturalHeight, src: el.src });
    el.onerror = () => setState('error');
    el.src = previewSrc(path);
  }, [path]);
  return state;
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

export function parseTime(text: string): number | null {
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1] ?? 0) * 60 + Number(m[2]);
}

export function run(tool: ToolWindowName, paths: string[], params: Params): Promise<void> {
  return invoke('toolwin:run', { tool, paths, params });
}
