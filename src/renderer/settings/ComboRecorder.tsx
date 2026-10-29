import { useEffect, useRef, useState } from 'react';
import type { WheelId } from '../../shared/formats';
import type { Combo } from '../../main/settings/schema';
import type { Verdict } from '../../shared/ipc';
import { Button, KeyCap, StatusBadge } from '../components/ui';
import { invoke } from '../shared/api';

const DEFAULTS: Record<WheelId, Combo> = {
  convert: { modifiers: ['shift'], code: 'KeyC' },
  tools: { modifiers: ['shift'], code: 'KeyT' },
  actions: { modifiers: ['shift'], code: 'KeyA' },
};

export const MODIFIER_LABEL: Record<string, string> = { shift: 'Shift', ctrl: 'Ctrl', alt: 'Alt' };

export function keyLabel(code: string): string {
  return code.replace(/^Key/, '').replace(/^Digit/, '');
}

const isModifierCode = (code: string): boolean => /^(Shift|Control|Alt|Meta|OS)/.test(code);

/** Click Change, press the combo, and main validates it (docs/04 section 6). */
export function ComboRecorder({
  wheel,
  combo,
  status,
  onSave,
  detected,
}: {
  wheel: WheelId;
  combo: Combo;
  status: Verdict | null;
  onSave: (combo: Combo) => void;
  detected: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState<{
    tone: 'danger' | 'warning' | 'success';
    text: string;
    pending?: Combo;
  } | null>(null);
  const field = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!recording) return;
    field.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setRecording(false);
        return;
      }
      const modifiers = [
        e.shiftKey && 'shift',
        e.ctrlKey && 'ctrl',
        e.altKey && 'alt',
        e.metaKey && 'meta',
      ].filter(Boolean) as ('shift' | 'ctrl' | 'alt' | 'meta')[];
      if (e.code === 'Backspace' && modifiers.length === 0) {
        onSave(DEFAULTS[wheel]);
        setMessage({ tone: 'success', text: 'Reset to the default.' });
        setRecording(false);
        return;
      }
      // Bare modifiers are ignored until a main key arrives.
      if (isModifierCode(e.code)) return;
      void invoke('combo:validate', { combo: { modifiers, code: e.code }, wheelId: wheel }).then(
        (verdict) => {
          setRecording(false);
          const next = {
            modifiers: modifiers.filter((m): m is 'shift' | 'ctrl' | 'alt' => m !== 'meta'),
            code: e.code,
          } as Combo;
          if (verdict.status === 'blocked')
            setMessage({ tone: 'danger', text: verdict.messages.join(' ') });
          else if (verdict.status === 'warning')
            setMessage({ tone: 'warning', text: verdict.messages.join(' '), pending: next });
          else {
            onSave(next);
            setMessage({ tone: 'success', text: 'Saved.' });
          }
        },
      );
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, wheel, onSave]);

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="w-20 font-medium capitalize">{wheel}</span>
          <div
            ref={field}
            tabIndex={-1}
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${detected ? 'border-accent bg-accent-soft' : 'border-transparent'}`}
            aria-live="polite"
          >
            {recording ? (
              <span className="text-sm text-muted">
                Press the new combo… (Esc to cancel, Backspace to reset)
              </span>
            ) : (
              <>
                {combo.modifiers.map((m) => (
                  <KeyCap key={m}>{MODIFIER_LABEL[m]}</KeyCap>
                ))}
                <KeyCap>{keyLabel(combo.code)}</KeyCap>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status && <StatusBadge status={status.status} />}
          <Button
            onClick={() => {
              setMessage(null);
              setRecording(true);
            }}
            disabled={recording}
          >
            Change
          </Button>
        </div>
      </div>
      {message && (
        <div
          className={`mt-2 text-sm ${message.tone === 'danger' ? 'text-danger' : message.tone === 'warning' ? 'text-[#e0a100]' : 'text-success'}`}
        >
          {message.text}
          {message.pending && (
            <span className="ml-3">
              <Button
                onClick={() => {
                  onSave(message.pending as Combo);
                  setMessage({ tone: 'success', text: 'Saved.' });
                }}
              >
                Use anyway
              </Button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
