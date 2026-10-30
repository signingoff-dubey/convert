import { RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  ACTIONS,
  CONVERT_TARGETS,
  SHARE_TARGETS,
  TOOLS,
  type Category,
} from '../../../shared/formats';
import { applyWheelPrefsWithFlags, wheelKey } from '../../../shared/wheels';
import { Button, KeyCap, SortableList, Switch } from '../../components/ui';
import { WheelPreview } from '../../components/WheelPreview';
import { CATEGORIES } from '../../shared/categories';
import { useSettings } from '../../shared/store';
import { keyLabel, MODIFIER_LABEL } from '../ComboRecorder';
import { usePatch } from '../SavedContext';

interface Entry {
  id: string;
  label: string;
}

function WheelColumn({
  title,
  wheel,
  category,
  entries,
}: {
  title: string;
  wheel: 'convert' | 'tools' | 'actions' | 'share';
  category: Category;
  entries: readonly Entry[];
}) {
  const s = useSettings((x) => x.settings);
  const save = usePatch();
  if (!s) return null;
  const key = wheelKey(wheel, wheel === 'actions' || wheel === 'share' ? null : category);
  const order = s.wheels.order[key];
  const disabled = s.wheels.disabled[key];
  const rows = applyWheelPrefsWithFlags(entries, order, disabled);
  const combo = s.triggers[wheel];
  const prefs = { order: s.wheels.order, disabled: s.wheels.disabled };
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="mt-1 flex items-center gap-1">
            {combo.modifiers.map((m) => (
              <KeyCap key={m}>{MODIFIER_LABEL[m]}</KeyCap>
            ))}
            <KeyCap>{keyLabel(combo.code)}</KeyCap>
          </div>
        </div>
        <Button
          variant="ghost"
          title="Reset this wheel"
          onClick={() => void save({ wheels: { order: { [key]: [] }, disabled: { [key]: [] } } })}
        >
          <RotateCcw size={14} /> Reset
        </Button>
      </div>
      <WheelPreview
        wheel={wheel}
        category={category}
        style={s.appearance.wheelStyle}
        opacity={s.appearance.wheelOpacity}
        prefs={prefs}
        size={220}
      />
      <div className="mt-3 overflow-hidden rounded-lg border border-line">
        <SortableList
          label={`${title} wedges`}
          items={rows}
          onReorder={(ids) => void save({ wheels: { order: { [key]: ids } } })}
          render={(row) => (
            <>
              <span className="cursor-grab select-none text-muted" aria-hidden>
                ⠿
              </span>
              <span className="flex-1 text-sm">{row.label}</span>
              <Switch
                label={`Show ${row.label}`}
                checked={row.enabled}
                onChange={(on) => {
                  const off = new Set(disabled ?? []);
                  if (on) off.delete(row.id);
                  else off.add(row.id);
                  void save({ wheels: { disabled: { [key]: [...off] } } });
                }}
              />
            </>
          )}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        Drag to reorder, or focus a row and press Alt with an arrow key. Wedges run clockwise from
        12 o’clock.
      </p>
    </div>
  );
}

export function Wheels() {
  const [category, setCategory] = useState<Category>('image');
  const info = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];
  const convert = useMemo<Entry[]>(
    () =>
      CONVERT_TARGETS[category].map((t) => ({
        id: t.id,
        label: t.label.replace(' (extract audio)', ''),
      })),
    [category],
  );
  const tools = useMemo<Entry[]>(
    () => (TOOLS[category] ?? []).map((t) => ({ id: t.id, label: t.label })),
    [category],
  );
  const actions = useMemo<Entry[]>(() => ACTIONS.map((a) => ({ id: a.id, label: a.label })), []);
  const share = useMemo<Entry[]>(
    () => SHARE_TARGETS.map((a) => ({ id: a.id, label: a.label })),
    [],
  );
  return (
    <>
      <div role="tablist" aria-label="File type" className="mb-4 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={c.id === category}
            onClick={() => setCategory(c.id)}
            className={`no-drag inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${c.id === category ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            <c.icon size={15} /> {c.label}
          </button>
        ))}
      </div>
      <h2 className="mb-3 text-xl font-semibold">{info?.toolsTitle}</h2>
      <div className={`grid gap-4 ${tools.length > 0 ? 'grid-cols-2' : 'grid-cols-1 max-w-sm'}`}>
        <WheelColumn
          title="Convert formats"
          wheel="convert"
          category={category}
          entries={convert}
        />
        {tools.length > 0 && (
          <WheelColumn title="File tools" wheel="tools" category={category} entries={tools} />
        )}
      </div>
      <h2 className="mb-3 mt-8 text-xl font-semibold">File actions</h2>
      <p className="mb-3 text-sm text-muted">
        Work on any file or folder, including mixed selections and files with no conversion tools.
      </p>
      <div className="max-w-sm">
        <WheelColumn title="File actions" wheel="actions" category={category} entries={actions} />
      </div>
      <h2 className="mb-3 mt-8 text-xl font-semibold">Share to apps</h2>
      <p className="mb-3 text-sm text-muted">
        Copies the files and opens the app, so you can paste them into a chat with Ctrl+V.
      </p>
      <div className="max-w-sm">
        <WheelColumn title="Share" wheel="share" category={category} entries={share} />
      </div>
    </>
  );
}
