import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button, Callout, SegmentedControl, Section, SettingRow } from '../../components/ui';
import { invoke } from '../../shared/api';
import { useSettings } from '../../shared/store';
import { usePatch } from '../SavedContext';

export function Advanced() {
  const s = useSettings((x) => x.settings);
  const save = usePatch();
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  if (!s) return null;
  const classes = s.general.allowedWindowClasses;
  const set = (next: string[]) => void save({ general: { allowedWindowClasses: next } });
  return (
    <>
      <Section
        title="Allowed windows"
        description="Window class names the wheel may start from while “Limit to Explorer and Desktop” is on."
      >
        {classes.map((c) => (
          <div key={c} className="flex items-center justify-between px-4 py-2 text-sm">
            <code>{c}</code>
            <Button
              variant="ghost"
              title={`Remove ${c}`}
              onClick={() => set(classes.filter((x) => x !== c))}
            >
              <X size={14} />
            </Button>
          </div>
        ))}
        <form
          className="flex gap-2 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            const v = draft.trim();
            if (v && !classes.includes(v)) set([...classes, v]);
            setDraft('');
          }}
        >
          <input
            aria-label="New window class"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Window class name"
            className="no-drag flex-1 rounded-lg border border-line bg-surface2 px-3 py-1.5 text-sm"
          />
          <Button type="submit">
            <Plus size={14} /> Add
          </Button>
        </form>
      </Section>
      <Section title="Logging">
        <SettingRow label="Log level">
          <SegmentedControl
            label="Log level"
            value={s.advanced.logLevel}
            options={[
              { value: 'error', label: 'Errors' },
              { value: 'info', label: 'Info' },
              { value: 'debug', label: 'Debug' },
            ]}
            onChange={(v) => void save({ advanced: { logLevel: v } })}
          />
        </SettingRow>
        <SettingRow
          label="Log folder"
          description="Key presses are never logged, except the three matched combos at debug level."
        >
          <Button onClick={() => void invoke('shell:open-logs')}>Open log folder</Button>
        </SettingRow>
      </Section>
      <Section title="Settings file">
        <SettingRow label="Export or import" description="Move your settings between computers.">
          <span className="flex gap-2">
            <Button onClick={() => void invoke('settings:export')}>Export</Button>
            <Button
              onClick={() =>
                void invoke('settings:import').then((r) =>
                  setMessage(r.ok ? 'Imported.' : (r.error ?? 'Cancelled.')),
                )
              }
            >
              Import
            </Button>
          </span>
        </SettingRow>
      </Section>
      {message && <Callout>{message}</Callout>}
      <Callout tone="warning">
        <strong>Elevated windows.</strong> Windows does not let a normal program watch an app that
        runs as administrator. If File Explorer was started as administrator, the wheel will not
        open there. Convert never elevates itself.
      </Callout>
    </>
  );
}
