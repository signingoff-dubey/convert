import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useSettings } from '../shared/store';

const Ctx = createContext<(patch: Record<string, unknown>) => Promise<void>>(async () => undefined);

/** Settings change live; a small "Saved" indicator fades in on each change (docs/03 section 1). */
export function SavedProvider({ children }: { children: ReactNode }) {
  const patch = useSettings((s) => s.patch);
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const save = useCallback(
    async (p: Record<string, unknown>) => {
      await patch(p);
      setVisible(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setVisible(false), 1400);
    },
    [patch],
  );
  return (
    <Ctx.Provider value={save}>
      {children}
      <div
        aria-live="polite"
        className={`pointer-events-none fixed right-6 top-12 rounded-full border border-line bg-surface px-3 py-1 text-xs text-success transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        Saved
      </div>
    </Ctx.Provider>
  );
}

export const usePatch = (): ((patch: Record<string, unknown>) => Promise<void>) => useContext(Ctx);
