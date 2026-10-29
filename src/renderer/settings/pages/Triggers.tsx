import { useEffect, useState } from 'react';
import type { WheelId } from '../../../shared/formats';
import type { Verdict } from '../../../shared/ipc';
import { Button, Callout, Section, SettingRow, Switch } from '../../components/ui';
import { invoke, on } from '../../shared/api';
import { useSettings } from '../../shared/store';
import { ComboRecorder } from '../ComboRecorder';
import { usePatch } from '../SavedContext';

const WHEELS: WheelId[] = ['convert', 'tools', 'actions'];

export function Triggers() {
  const s = useSettings((x) => x.settings);
  const save = usePatch();
  const [status, setStatus] = useState<Record<string, Verdict>>({});
  const [testing, setTesting] = useState(false);
  const [detected, setDetected] = useState<WheelId | null>(null);

  const recheck = () => void invoke('combo:recheck').then(setStatus);
  useEffect(recheck, []);
  useEffect(() => {
    void invoke('combo:test:toggle', { on: testing });
    if (!testing) return;
    let timer: number | undefined;
    const off = on<{ combo: string; wheelId: WheelId | null }>('combo:test:event', (e) => {
      setDetected(e.wheelId);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setDetected(null), 700);
    });
    return () => {
      off();
      window.clearTimeout(timer);
      // Test mode turns itself off when the page is left (docs/04 section 6).
      void invoke('combo:test:toggle', { on: false });
    };
  }, [testing]);

  if (!s) return null;
  return (
    <>
      <Callout>
        Start dragging a file, then tap a key. The wheel stays open until you drop or press Esc.
        Hold Shift once and tap the letter; do not tap Shift five times in a row, because Windows
        turns on Sticky Keys.
      </Callout>
      <Section title="Wheel keys">
        {WHEELS.map((w) => (
          <ComboRecorder
            key={w}
            wheel={w}
            combo={s.triggers[w]}
            status={status[w] ?? null}
            detected={detected === w}
            onSave={(combo) => void save({ triggers: { [w]: combo } }).then(recheck)}
          />
        ))}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs text-muted">
            Checked against registered system hotkeys. Some apps can’t be detected.
          </span>
          <span className="flex gap-2">
            <Button onClick={recheck}>Re-check conflicts</Button>
            <Button
              variant="ghost"
              onClick={() =>
                void save({
                  triggers: {
                    convert: { modifiers: ['shift'], code: 'KeyC' },
                    tools: { modifiers: ['shift'], code: 'KeyT' },
                    actions: { modifiers: ['shift'], code: 'KeyA' },
                  },
                }).then(recheck)
              }
            >
              Reset to defaults
            </Button>
          </span>
        </div>
      </Section>
      <Section
        title="Test combos"
        description="While on, pressing a combo anywhere lights up its row. Nothing is stored or logged."
      >
        <SettingRow
          label="Test combos"
          description={
            testing
              ? 'Press one of your combos now.'
              : 'Turn on to see key presses matched to wheels.'
          }
        >
          <Switch label="Test combos" checked={testing} onChange={setTesting} />
        </SettingRow>
      </Section>
    </>
  );
}
