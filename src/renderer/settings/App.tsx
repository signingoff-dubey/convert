import {
  Cog,
  Command,
  Folders,
  HardDrive,
  Info,
  Keyboard,
  Palette,
  Sparkles,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, Dialog, Switch } from '../components/ui';
import { invoke } from '../shared/api';
import { useSettings } from '../shared/store';
import { Onboarding } from './Onboarding';
import { SavedProvider, usePatch } from './SavedContext';
import { About } from './pages/About';
import { Advanced } from './pages/Advanced';
import { Appearance } from './pages/Appearance';
import { Engines } from './pages/Engines';
import { Features } from './pages/Features';
import { General } from './pages/General';
import { Output } from './pages/Output';
import { Triggers } from './pages/Triggers';
import { Wheels } from './pages/Wheels';

type PageId =
  | 'general'
  | 'triggers'
  | 'appearance'
  | 'wheels'
  | 'features'
  | 'output'
  | 'engines'
  | 'advanced'
  | 'about';

const PAGES: { id: PageId; label: string; icon: LucideIcon; render: () => ReactNode }[] = [
  { id: 'general', label: 'General', icon: Cog, render: () => <General /> },
  { id: 'triggers', label: 'Triggers', icon: Keyboard, render: () => <Triggers /> },
  { id: 'appearance', label: 'Appearance', icon: Palette, render: () => <Appearance /> },
  { id: 'wheels', label: 'Wheels', icon: Command, render: () => <Wheels /> },
  { id: 'features', label: 'Features', icon: Sparkles, render: () => <Features /> },
  { id: 'output', label: 'Output', icon: Folders, render: () => <Output /> },
  { id: 'engines', label: 'Engines', icon: HardDrive, render: () => <Engines /> },
  { id: 'advanced', label: 'Advanced', icon: Wrench, render: () => <Advanced /> },
  { id: 'about', label: 'About', icon: Info, render: () => <About /> },
];

function Shell() {
  const settings = useSettings((s) => s.settings);
  const init = useSettings((s) => s.init);
  const save = usePatch();
  const [page, setPage] = useState<PageId>('general');
  const [firstRun, setFirstRun] = useState(false);
  const [version, setVersion] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    void init();
    void invoke('app:meta').then((m) => {
      setFirstRun(m.firstRun);
      setVersion(m.version);
    });
  }, [init]);

  if (!settings) return null;
  const current = PAGES.find((p) => p.id === page) ?? PAGES[0];
  return (
    <div className="flex h-full pt-10">
      <div className="drag-region fixed left-0 right-0 top-0 h-10" />
      <nav
        className="flex w-[220px] shrink-0 flex-col border-r border-line px-3 pb-3"
        aria-label="Settings pages"
      >
        <ul className="flex-1 space-y-0.5 pt-2">
          {PAGES.map((p) => (
            <li key={p.id}>
              <button
                aria-current={p.id === page ? 'page' : undefined}
                onClick={() => setPage(p.id)}
                className={`no-drag flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm ${p.id === page ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:bg-surface/60 hover:text-ink'}`}
              >
                <p.icon size={16} /> {p.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="space-y-2 border-t border-line pt-3 text-sm">
          <div className="flex items-center justify-between px-1">
            <span>Pause Convert</span>
            <Switch
              label="Pause Convert"
              checked={settings.general.paused}
              onChange={(v) => void save({ general: { paused: v } })}
            />
          </div>
          <button
            className="no-drag px-1 text-muted underline-offset-2 hover:text-ink hover:underline"
            onClick={() => setConfirmReset(true)}
          >
            Reset all settings
          </button>
          <div className="px-1 text-xs text-muted">Version {version}</div>
        </div>
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <h1 className="sticky top-0 z-10 bg-bg/95 px-8 pb-3 pt-5 text-2xl font-semibold backdrop-blur">
          {current?.label}
        </h1>
        <div className="px-8 pb-10">{current?.render()}</div>
      </main>
      {firstRun && <Onboarding onDone={() => setFirstRun(false)} />}
      {confirmReset && (
        <Dialog
          title="Reset all settings?"
          onClose={() => setConfirmReset(false)}
          actions={
            <>
              <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  void invoke('settings:reset');
                  setConfirmReset(false);
                }}
              >
                Reset
              </Button>
            </>
          }
        >
          Your current settings file is backed up first, then everything returns to its defaults.
        </Dialog>
      )}
    </div>
  );
}

export function App() {
  return (
    <SavedProvider>
      <Shell />
    </SavedProvider>
  );
}
