import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { on } from '../shared/api';
import { useSettings } from '../shared/store';
import '../theme/tokens.css';

interface State {
  percent: number;
  indeterminate: boolean;
  count: number;
}

const R = 19;
const C = 2 * Math.PI * R;

/** A small progress ring with the percentage inside, shown beside the pointer while a job runs. */
function App() {
  const init = useSettings((s) => s.init);
  const [state, setState] = useState<State>({ percent: 0, indeterminate: true, count: 1 });
  useEffect(() => {
    void init();
    return on<State>('loader:update', setState);
  }, [init]);
  const dash = state.indeterminate ? C * 0.25 : (C * state.percent) / 100;
  return (
    <div className="grid h-full w-full place-items-center">
      <div
        className="relative grid h-[50px] w-[50px] place-items-center rounded-full border border-line bg-surface shadow-lg"
        role="progressbar"
        aria-label="Working"
        aria-valuenow={state.indeterminate ? undefined : state.percent}
      >
        <svg
          width="46"
          height="46"
          viewBox="0 0 46 46"
          className="absolute"
          style={{ transform: 'rotate(-90deg)' }}
        >
          <circle cx="23" cy="23" r={R} fill="none" stroke="var(--border)" strokeWidth="4" />
          <circle
            cx="23"
            cy="23"
            r={R}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${C}`}
            style={{
              transition: 'stroke-dasharray 180ms ease-out',
              transformOrigin: '23px 23px',
              animation: state.indeterminate ? 'loader-spin 0.9s linear infinite' : undefined,
            }}
          />
        </svg>
        <span className="relative text-[11px] font-bold tabular-nums">
          {state.indeterminate ? '' : `${state.percent}`}
        </span>
        {state.count > 1 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-on-accent">
            {state.count}
          </span>
        )}
      </div>
      <style>{`@keyframes loader-spin { to { transform: rotate(360deg) } } html,body{background:transparent!important}`}</style>
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
