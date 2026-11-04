import { useCallback, useEffect, useState } from 'react';
import { Button, Section } from '../../components/ui';
import { invoke, on } from '../../shared/api';

type Update = Awaited<ReturnType<typeof loadUpdate>>;
const loadUpdate = () => invoke('update:status');

/** One plain sentence for each state of the updater. */
export function updateText(u: Update): string {
  switch (u.state) {
    case 'off':
      return u.reason ?? 'Updates are off.';
    case 'checking':
      return 'Checking for a newer version…';
    case 'downloading':
      return `Downloading version ${u.version ?? ''} in the background (${u.percent ?? 0}%)…`;
    case 'ready':
      return `Version ${u.version ?? ''} is ready. It installs when Convert is not busy.`;
    case 'current':
      return 'You have the latest version.';
    case 'error':
      return u.message ?? 'Could not check for updates.';
    default:
      return 'Updates are checked in the background.';
  }
}

/** The download's progress as 0 to 100, or null when nothing is downloading. */
export function updateProgress(u: Update): number | null {
  return u.state === 'downloading' ? Math.max(0, Math.min(100, u.percent ?? 0)) : null;
}

export function About() {
  const [update, setUpdate] = useState<Update | null>(null);
  const refresh = useCallback(() => void loadUpdate().then(setUpdate), []);
  useEffect(() => {
    refresh();
    return on('update:changed', refresh);
  }, [refresh]);
  const [meta, setMeta] = useState<{ version: string; platform: string } | null>(null);
  const [licenses, setLicenses] = useState('');
  useEffect(() => {
    void invoke('app:meta').then(setMeta);
    void invoke('app:licenses').then(setLicenses);
  }, []);
  return (
    <>
      <Section title="Convert">
        <div className="px-4 py-3 text-sm">
          <div className="text-base font-semibold">Convert {meta?.version}</div>
          <p className="mt-1 text-muted">
            Drag a file. Tap a key. Drop on a wheel. Everything runs on this computer, and nothing
            is uploaded.
          </p>
          <p className="mt-2 text-muted">
            Convert is inspired by the drag-and-wheel idea; it contains no third-party app code.
          </p>
        </div>
      </Section>
      <Section title="Updates">
        <div className="px-4 pt-3">
          {update && updateProgress(update) !== null && (
            <div
              role="progressbar"
              aria-label="Update download"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={updateProgress(update) ?? 0}
              className="h-2 overflow-hidden rounded-full bg-surface2"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300"
                style={{ width: `${updateProgress(update)}%` }}
              />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
          <span className="text-muted">{update ? updateText(update) : ''}</span>
          <span className="flex shrink-0 gap-2">
            {update?.state === 'ready' && (
              <Button variant="primary" onClick={() => void invoke('update:install')}>
                Restart and update
              </Button>
            )}
            <Button
              disabled={update?.state === 'checking' || update?.state === 'downloading'}
              onClick={() => void invoke('update:check')}
            >
              Check now
            </Button>
          </span>
        </div>
      </Section>
      <Section
        title="Open-source licenses"
        description="ffmpeg is a separate bundled program, started with an argument list. Its source is available from the ffmpeg project."
      >
        <pre className="max-h-[420px] select-text overflow-auto whitespace-pre-wrap p-4 text-xs text-muted">
          {licenses}
        </pre>
      </Section>
    </>
  );
}
