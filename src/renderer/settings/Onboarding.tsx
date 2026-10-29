import { useEffect, useState } from 'react';
import type { WheelId } from '../../shared/formats';
import { Button, KeyCap, Switch } from '../components/ui';
import { invoke, on } from '../shared/api';
import { useSettings } from '../shared/store';
import { keyLabel, MODIFIER_LABEL } from './ComboRecorder';
import { usePatch } from './SavedContext';

const WHEELS: { id: WheelId; label: string }[] = [
  { id: 'convert', label: 'Convert formats' },
  { id: 'tools', label: 'File tools' },
  { id: 'actions', label: 'File actions' },
];

/** Three short steps on first run. It never opens again on its own (docs/01 section 8). */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const s = useSettings((x) => x.settings);
  const save = usePatch();
  const [step, setStep] = useState(1);
  const [sample, setSample] = useState<string | null>(null);
  const [pressed, setPressed] = useState<WheelId | null>(null);

  useEffect(() => {
    if (step === 1) {
      void invoke('app:sample-file').then(setSample);
      void invoke('app:onboarding', { on: true });
    } else void invoke('app:onboarding', { on: false });
    if (step !== 2) return;
    void invoke('combo:test:toggle', { on: true });
    let timer: number | undefined;
    const off = on<{ wheelId: WheelId | null }>('combo:test:event', (e) => {
      setPressed(e.wheelId);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setPressed(null), 600);
    });
    return () => {
      off();
      window.clearTimeout(timer);
      void invoke('combo:test:toggle', { on: false });
    };
  }, [step]);

  if (!s) return null;
  const finish = async () => {
    await invoke('app:first-run-done');
    await invoke('app:onboarding', { on: false });
    // Auto-start is registered only now, after the user has passed step 3.
    await save({ general: { startWithWindows: s.general.startWithWindows } });
    onDone();
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-bg/90 p-8 backdrop-blur-sm">
      <div
        className="w-[560px] rounded-2xl border border-line bg-surface p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Convert"
      >
        <div className="mb-1 text-xs uppercase tracking-wide text-muted">Step {step} of 3</div>
        {step === 1 && (
          <>
            <h2 className="mb-2 text-xl font-semibold">Drag the sample file onto the wheel</h2>
            <p className="mb-4 text-sm text-muted">
              Press and hold the mouse on the sample below and start dragging. While still holding,
              tap <KeyCap>Shift</KeyCap> <KeyCap>C</KeyCap>. A wheel opens under the pointer. Drop
              the file on a wedge.
            </p>
            <div
              draggable
              onDragStart={(e) => {
                e.preventDefault();
                void invoke('app:sample-drag');
              }}
              className="mx-auto flex w-56 cursor-grab flex-col items-center rounded-xl border border-dashed border-accent bg-accent-soft p-4"
            >
              <div
                className="mb-2 h-16 w-28 rounded-lg"
                style={{ background: 'linear-gradient(135deg, var(--accent), #19c3e6)' }}
              />
              <span className="text-sm font-medium">convert-sample.png</span>
              <span className="text-xs text-muted">{sample ? 'ready to drag' : 'preparing…'}</span>
            </div>
            <p className="mt-3 text-xs text-muted">
              Skip this if you like; you can try it any time from File Explorer.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <h2 className="mb-2 text-xl font-semibold">Your three keys</h2>
            <p className="mb-4 text-sm text-muted">
              Press a combo now to see it light up. Change them any time under Triggers.
            </p>
            <div className="divide-y divide-line rounded-xl border border-line">
              {WHEELS.map((w) => (
                <div
                  key={w.id}
                  className={`flex items-center justify-between px-4 py-3 ${pressed === w.id ? 'bg-accent-soft' : ''}`}
                >
                  <span className="font-medium">{w.label}</span>
                  <span className="flex items-center gap-1">
                    {s.triggers[w.id].modifiers.map((m) => (
                      <KeyCap key={m}>{MODIFIER_LABEL[m]}</KeyCap>
                    ))}
                    <KeyCap>{keyLabel(s.triggers[w.id].code)}</KeyCap>
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              Hold Shift once and tap the letter. Tapping Shift five times turns on Sticky Keys.
            </p>
          </>
        )}
        {step === 3 && (
          <>
            <h2 className="mb-4 text-xl font-semibold">Two last choices</h2>
            <div className="divide-y divide-line rounded-xl border border-line">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium">Start with Windows</div>
                  <div className="text-sm text-muted">Runs quietly in the tray.</div>
                </div>
                <Switch
                  label="Start with Windows"
                  checked={s.general.startWithWindows}
                  onChange={(v) => void save({ general: { startWithWindows: v } })}
                />
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium">Limit to Explorer and Desktop</div>
                  <div className="text-sm text-muted">
                    Keeps the wheel out of other apps and games.
                  </div>
                </div>
                <Switch
                  label="Limit to Explorer and Desktop"
                  checked={s.general.limitToExplorerAndDesktop}
                  onChange={(v) => void save({ general: { limitToExplorerAndDesktop: v } })}
                />
              </div>
            </div>
          </>
        )}
        <div className="mt-6 flex justify-between">
          <Button variant="ghost" onClick={() => (step === 1 ? void finish() : setStep(step - 1))}>
            {step === 1 ? 'Skip' : 'Back'}
          </Button>
          <Button
            variant="primary"
            onClick={() => (step === 3 ? void finish() : setStep(step + 1))}
          >
            {step === 3 ? 'Finish' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
