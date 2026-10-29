import { AlertTriangle, Check, FolderOpen, Loader2, Undo2, X } from 'lucide-react';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { STRINGS } from '../../shared/strings';
import type { ToastModel } from '../../main/windows/toast-window';
import { invoke, on } from '../shared/api';
import { useSettings } from '../shared/store';
import '../theme/tokens.css';

function ToastCard({ t }: { t: ToastModel }) {
  const icon =
    t.kind === 'progress' ? (
      <Loader2 size={18} className="animate-spin text-accent" />
    ) : t.kind === 'error' ? (
      <AlertTriangle size={18} className="text-danger" />
    ) : (
      <Check size={18} className="text-success" />
    );
  const act = (channel: 'job:cancel' | 'job:undo' | 'job:reveal') => () =>
    void Promise.all(t.jobIds.map((jobId) => invoke(channel, { jobId })));
  return (
    <div
      className="mb-2 rounded-xl border border-line bg-surface p-3 shadow-xl"
      role={t.kind === 'error' ? 'alert' : 'status'}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={t.title}>
            {t.title}
          </div>
          {t.detail && <div className="mt-0.5 text-xs text-muted">{t.detail}</div>}
          {t.kind === 'progress' && (
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface2"
              aria-label="Progress"
              role="progressbar"
              aria-valuenow={t.percent ?? 0}
            >
              <div
                className="h-full rounded-full bg-accent transition-all duration-150"
                style={{ width: `${t.percent ?? 0}%` }}
              />
            </div>
          )}
          <div className="mt-2 flex gap-3 text-xs">
            {t.canCancel && (
              <button className="text-muted hover:text-ink" onClick={act('job:cancel')}>
                {STRINGS.toast.cancel}
              </button>
            )}
            {t.canReveal && (
              <button
                className="inline-flex items-center gap-1 text-accent hover:underline"
                onClick={act('job:reveal')}
              >
                <FolderOpen size={12} /> {STRINGS.toast.showInFolder}
              </button>
            )}
            {t.canUndo && (
              <button
                className="inline-flex items-center gap-1 text-muted hover:text-ink"
                onClick={act('job:undo')}
              >
                <Undo2 size={12} /> {STRINGS.toast.undo}
              </button>
            )}
            {t.kind === 'error' && (
              <button
                className="text-muted hover:text-ink"
                onClick={() => void invoke('shell:open-logs')}
              >
                {STRINGS.toast.details}
              </button>
            )}
          </div>
        </div>
        <button
          aria-label="Dismiss"
          className="text-muted hover:text-ink"
          onClick={() => void invoke('toast:dismiss', { id: t.id })}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function App() {
  const init = useSettings((s) => s.init);
  const [toasts, setToasts] = useState<ToastModel[]>([]);
  useEffect(() => {
    void init();
    return on<ToastModel[]>('toast:update', setToasts);
  }, [init]);
  return (
    <div className="p-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} t={t} />
      ))}
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
