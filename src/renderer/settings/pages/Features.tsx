import { ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { ACTIONS, CONVERT_TARGETS, TOOLS } from '../../../shared/formats';
import type { Category } from '../../../shared/formats';
import { WEDGE_ICONS } from '../../components/icons';
import { KeyCap } from '../../components/ui';
import { CATEGORIES, FORMAT_TABLE } from '../../shared/categories';
import { useSettings } from '../../shared/store';
import { keyLabel, MODIFIER_LABEL } from '../ComboRecorder';

const SUMMARY: Record<string, string> = {
  collage: 'Needs two or more images.',
  redact: 'Detection runs on this computer. Nothing is uploaded.',
  merge: 'Needs two or more PDFs.',
};

/** A browsable summary of everything Convert can do, per file type. */
export function Features() {
  const s = useSettings((x) => x.settings);
  const [category, setCategory] = useState<Category>('image');
  const [open, setOpen] = useState<string | null>(null);
  if (!s) return null;
  const info = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];
  const tools = TOOLS[category] ?? [];
  const cap = (w: 'convert' | 'tools' | 'actions') => (
    <span className="inline-flex items-center gap-1">
      {s.triggers[w].modifiers.map((m) => (
        <KeyCap key={m}>{MODIFIER_LABEL[m]}</KeyCap>
      ))}
      <KeyCap>{keyLabel(s.triggers[w].code)}</KeyCap>
    </span>
  );
  return (
    <>
      <div role="tablist" aria-label="File type" className="mb-4 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={c.id === category}
            onClick={() => {
              setCategory(c.id);
              setOpen(null);
            }}
            className={`no-drag inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${c.id === category ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            <c.icon size={15} /> {c.label}
          </button>
        ))}
      </div>

      <section className="mb-6 rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-4 text-center text-2xl font-semibold">{info?.toolsTitle}</h2>
        <div className="grid grid-cols-2 gap-6">
          <div className="text-center">
            <div className="mb-2">{cap('convert')}</div>
            <div className="mb-2 text-sm text-muted">Convert formats</div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {CONVERT_TARGETS[category].map((t) => (
                <span
                  key={t.id}
                  className="rounded-md border border-line bg-surface2 px-2 py-0.5 text-xs font-semibold"
                >
                  {t.label.replace(' (extract audio)', ' (audio)')}
                </span>
              ))}
            </div>
          </div>
          <div className="border-l border-line pl-6 text-center">
            <div className="mb-2">{cap('tools')}</div>
            <div className="mb-2 text-sm text-muted">File tools</div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {tools.length === 0 && (
                <span className="text-xs text-muted">
                  No tools for this type yet. File actions still work.
                </span>
              )}
              {tools.map((t) => {
                const Icon = WEDGE_ICONS[t.id];
                return (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded-md border border-line bg-surface2 px-2 py-0.5 text-xs font-semibold"
                  >
                    {Icon && <Icon size={12} />} {t.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-sm text-muted">
          Start dragging, then tap a key. The wheel stays open until you drop. Change the keys in
          Settings.
        </p>
      </section>

      {tools.length > 0 && (
        <div className="mb-8 grid grid-cols-3 gap-3">
          {tools.map((t) => {
            const Icon = WEDGE_ICONS[t.id];
            const expanded = open === t.id;
            return (
              <article
                key={t.id}
                className="flex flex-col rounded-2xl border border-line bg-surface p-4"
              >
                <div className="mb-3 flex items-center gap-2 text-muted">
                  {Icon && <Icon size={18} />}
                  {(t.minFiles ?? 1) > 1 && (
                    <span className="rounded-md bg-surface2 px-2 py-0.5 text-[11px]">
                      Multiple files
                    </span>
                  )}
                </div>
                <h3 className="text-base font-semibold">{t.label}</h3>
                <p className="mt-1 flex-1 text-sm text-muted">
                  {t.description ??
                    'Runs immediately with the defaults from Settings, then Output.'}
                </p>
                {expanded && (
                  <p className="mt-2 rounded-lg bg-surface2 p-2 text-xs text-muted">
                    {SUMMARY[t.id] ??
                      (t.opensWindow
                        ? 'Opens a small window with a preview and a Run button.'
                        : 'Runs immediately and shows a toast when done.')}{' '}
                    Your original file is never changed; the result is saved beside it.
                  </p>
                )}
                <button
                  className="no-drag mt-3 flex items-center justify-between border-t border-line pt-2 text-xs font-semibold"
                  onClick={() => setOpen(expanded ? null : t.id)}
                  aria-expanded={expanded}
                >
                  View details <ArrowUpRight size={14} className="text-accent" />
                </button>
              </article>
            );
          })}
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-1 text-2xl font-semibold">File actions</h2>
        <p className="mb-3 text-sm text-muted">
          Drag any file or folder, then tap {cap('actions')}.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {ACTIONS.map((a) => {
            const Icon = WEDGE_ICONS[a.id];
            return (
              <article key={a.id} className="rounded-2xl border border-line bg-surface p-4">
                {Icon && <Icon size={20} className="mb-2 text-muted" />}
                <h3 className="font-semibold">{a.label}</h3>
                <p className="mt-1 text-sm text-muted">{a.description}</p>
              </article>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          Works with folders, mixed selections, and files that have no conversion tools.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-2xl font-semibold">Supported formats</h2>
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {FORMAT_TABLE.map((row) => (
            <div key={row.category} className="grid grid-cols-[130px_1fr] gap-4 px-4 py-3 text-sm">
              <div className="font-medium">{row.category}</div>
              <div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {row.formats.map((f) => (
                    <span key={f}>{f}</span>
                  ))}
                </div>
                {row.note && <div className="mt-1 text-xs text-muted">{row.note}</div>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
