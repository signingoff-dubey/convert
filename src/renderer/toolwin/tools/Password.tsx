import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Callout, Field, inputCls } from '../../components/ui';
import { invoke } from '../../shared/api';
import { run, ToolFrame } from '../kit';

const nameOf = (p: string): string => p.split(/[\\/]/).pop() ?? p;

export function Password({ paths }: { paths: string[] }) {
  const file = paths[0] as string;
  const [encrypted, setEncrypted] = useState<boolean | null | 'loading'>('loading');
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  useEffect(
    () =>
      void invoke('toolwin:probe', { path: file })
        .then((r) => setEncrypted(r.encrypted))
        .catch(() => setEncrypted(null)),
    [file],
  );
  const kind = /\.zip$/i.test(file) ? 'ZIP' : 'PDF';
  const remove = encrypted === true;
  const known = encrypted === true || encrypted === false;
  const valid = known && pw !== '' && (remove || pw === again);
  return (
    <ToolFrame
      tool="password"
      runLabel={remove ? 'Remove password' : 'Add password'}
      canRun={valid}
      note="Your original is never changed. A new file is saved beside it."
      onRun={() => void run('password', paths, { mode: remove ? 'remove' : 'add', password: pw })}
    >
      <p className="mb-4 text-sm">
        <strong>{nameOf(file)}</strong> {encrypted === 'loading' && '…'}
        {remove && `has a password. Enter it to save a copy without one.`}
        {encrypted === false && `has no password. Choose one to save a protected copy.`}
        {encrypted === null && `could not be checked.`}
      </p>
      {known && (
        <>
          <Field label={remove ? `Current ${kind} password` : 'New password'}>
            <span className="flex gap-2">
              <input
                autoFocus
                type={show ? 'text' : 'password'}
                className={inputCls}
                value={pw}
                autoComplete="off"
                onChange={(e) => setPw(e.target.value)}
              />
              <button
                type="button"
                aria-label={show ? 'Hide password' : 'Show password'}
                className="rounded border border-line px-2 text-muted hover:text-ink"
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </Field>
          {!remove && (
            <Field
              label="Type it again"
              hint={again !== '' && again !== pw ? 'The passwords do not match.' : undefined}
            >
              <input
                type={show ? 'text' : 'password'}
                className={inputCls}
                value={again}
                autoComplete="off"
                onChange={(e) => setAgain(e.target.value)}
              />
            </Field>
          )}
          {!remove && (
            <Callout tone="warning">
              There is no way to recover a forgotten password.{' '}
              {kind === 'ZIP' ? 'ZIP files use AES-256.' : 'The PDF uses AES-256.'}
            </Callout>
          )}
        </>
      )}
    </ToolFrame>
  );
}
