import { ArrowRight, Eye, FolderPlus, Trash2 } from 'lucide-react';
import { CONVERT_TARGETS } from '../../../shared/formats';
import { Button, Callout, inputCls, Switch } from '../../components/ui';
import { invoke } from '../../shared/api';
import { CATEGORIES } from '../../shared/categories';
import { useSettings } from '../../shared/store';
import { usePatch } from '../SavedContext';

interface Rule {
  id: string;
  folder: string;
  target: string;
  enabled: boolean;
}

const MAX_RULES = 10;

/** One option per output format, grouped by the kind of file it applies to. */
function TargetSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      aria-label="Convert new files to"
      className={`${inputCls} w-40`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {CATEGORIES.map((c) => (
        <optgroup key={c.id} label={c.label}>
          {CONVERT_TARGETS[c.id].map((t) => (
            <option key={`${c.id}-${t.id}`} value={t.id}>
              {t.label.replace(' (extract audio)', '').replace(' (read text)', '')}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function Watch() {
  const s = useSettings((x) => x.settings);
  const save = usePatch();
  if (!s) return null;
  const rules: Rule[] = s.watch.rules;
  const write = (next: Rule[]) => void save({ watch: { rules: next } });

  const add = async () => {
    const folder = await invoke('dialog:pick-folder');
    if (!folder) return;
    write([...rules, { id: `w${Date.now().toString(36)}`, folder, target: 'pdf', enabled: true }]);
  };

  return (
    <>
      <p className="mb-4 text-sm text-muted">
        Pick a folder and a format. Every new file that lands in it, such as a download or a
        screenshot, is converted on its own and saved beside the original. Files already in the
        folder are left alone, and a file that is still downloading waits until it is complete.
      </p>
      {rules.length === 0 ? (
        <div className="mb-4 grid place-items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-surface2 text-accent">
            <Eye size={22} />
          </span>
          <div>
            <div className="font-medium">No watched folders yet</div>
            <div className="mt-1 text-sm text-muted">
              Try your Downloads folder with PDF, or a screenshots folder with JPG.
            </div>
          </div>
          <Button variant="primary" onClick={() => void add()}>
            <FolderPlus size={16} /> Add a folder
          </Button>
        </div>
      ) : (
        <ul className="mb-4 space-y-2">
          {rules.map((r) => (
            <li
              key={r.id}
              className={`flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 ${r.enabled ? '' : 'opacity-60'}`}
            >
              <Switch
                label={`Watch ${r.folder}`}
                checked={r.enabled}
                onChange={(v) =>
                  write(rules.map((x) => (x.id === r.id ? { ...x, enabled: v } : x)))
                }
              />
              <span className="min-w-0 flex-1 truncate font-medium" title={r.folder}>
                {r.folder}
              </span>
              <ArrowRight size={16} className="shrink-0 text-muted" />
              <TargetSelect
                value={r.target}
                onChange={(v) => write(rules.map((x) => (x.id === r.id ? { ...x, target: v } : x)))}
              />
              <Button
                variant="ghost"
                title="Stop watching this folder"
                onClick={() => write(rules.filter((x) => x.id !== r.id))}
              >
                <Trash2 size={16} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {rules.length > 0 && (
        <Button disabled={rules.length >= MAX_RULES} onClick={() => void add()}>
          <FolderPlus size={16} /> Add a folder
        </Button>
      )}
      <div className="mt-4">
        <Callout>
          Only files that can become the chosen format are converted: a PNG in a folder set to PDF,
          but not a song. Convert's own results are never converted again.
        </Callout>
      </div>
    </>
  );
}
