import { useEffect, useState } from 'react';
import { Section } from '../../components/ui';
import { invoke } from '../../shared/api';

export function About() {
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
