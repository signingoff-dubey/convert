import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Callout, Section } from '../../components/ui';
import { invoke } from '../../shared/api';
import { useSettings } from '../../shared/store';
import { usePatch } from '../SavedContext';

type Row = Awaited<ReturnType<typeof loadStatus>>[number];
const loadStatus = () => invoke('engines:status');

type Check = Awaited<ReturnType<typeof runTest>>[number];
const runTest = () => invoke('engines:selftest');

export function Engines() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [running, setRunning] = useState(false);
  const test = () => {
    setRunning(true);
    void runTest()
      .then(setChecks)
      .finally(() => setRunning(false));
  };
  const s = useSettings((x) => x.settings);
  const save = usePatch();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [officePath, setOfficePath] = useState('');
  const refresh = () => void loadStatus().then(setRows);
  useEffect(refresh, [s?.engines.officeEnginePath]);
  useEffect(() => setOfficePath(s?.engines.officeEnginePath ?? ''), [s?.engines.officeEnginePath]);
  if (!s) return null;
  return (
    <>
      <Callout>
        Everything runs from bundled engines on this computer. The two optional engines unlock more
        wedges; without them those wedges are simply hidden.
      </Callout>
      <Section title="Engines">
        {rows === null && <div className="px-4 py-3 text-sm text-muted">Checking engines…</div>}
        {rows?.map((r) => (
          <div key={r.id} className="flex items-start gap-3 px-4 py-3">
            {r.ready ? (
              <CheckCircle2 size={18} className="mt-0.5 text-success" />
            ) : r.optional ? (
              <CircleDashed size={18} className="mt-0.5 text-muted" />
            ) : (
              <XCircle size={18} className="mt-0.5 text-danger" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.label}</span>
                {r.optional && (
                  <span className="rounded-full border border-line px-2 text-[11px] text-muted">
                    optional
                  </span>
                )}
              </div>
              <div className="text-sm text-muted">
                {r.ready ? `Ready${r.version ? ` · ${r.version}` : ''}` : 'Missing'}
              </div>
              {r.detail && <div className="mt-1 text-xs text-muted">{r.detail}</div>}
            </div>
          </div>
        ))}
      </Section>
      <Section
        title="Self-test"
        description="Makes each engine do a small real job on this computer, so you can see what works and what does not. Takes a few seconds."
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="primary" disabled={running} onClick={test}>
            {running ? 'Testing…' : checks ? 'Run again' : 'Run self-test'}
          </Button>
          {checks && (
            <span className="text-sm text-muted">
              {checks.filter((c) => c.ok).length} of {checks.length} passed
            </span>
          )}
          <Button variant="ghost" onClick={() => void invoke('app:copy-diagnostics')}>
            Copy diagnostics
          </Button>
        </div>
        {checks?.map((c) => (
          <div key={c.id} className="flex items-start gap-3 px-4 py-2">
            {c.ok ? (
              <CheckCircle2 size={18} className="mt-0.5 text-success" />
            ) : (
              <XCircle size={18} className="mt-0.5 text-danger" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {c.label} <span className="font-normal text-muted">· {c.ms} ms</span>
              </div>
              <div className={`text-xs ${c.ok ? 'text-muted' : 'text-danger'}`}>{c.detail}</div>
            </div>
          </div>
        ))}
      </Section>
      <Section
        title="Office engine"
        description="Convert uses LibreOffice, if installed, for PDF export from documents, slides and spreadsheets, and for PDF to DOCX or PPTX."
      >
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <Button onClick={() => void invoke('engines:detect-office').then(refresh)}>
            Detect LibreOffice
          </Button>
          <input
            aria-label="Path to soffice.exe"
            value={officePath}
            placeholder="C:\Program Files\LibreOffice\program\soffice.exe"
            onChange={(e) => setOfficePath(e.target.value)}
            onBlur={() =>
              void save({
                engines: { officeEnginePath: officePath.trim() === '' ? null : officePath.trim() },
              })
            }
            className="no-drag min-w-[320px] flex-1 rounded-lg border border-line bg-surface2 px-3 py-1.5 text-sm"
          />
        </div>
      </Section>
    </>
  );
}
