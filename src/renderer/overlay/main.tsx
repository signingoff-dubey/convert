import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { WheelId } from '../../shared/formats';
import { HOLE, RING, Wheel } from '../components/Wheel';
import { invoke, on, pathForFile } from '../shared/api';
import { useSettings } from '../shared/store';
import '../theme/tokens.css';
import { hitTest } from './hit-test';
import { buildWheel, itemsFromMimeTypes, sourceLabel } from './wedges';

interface OpenPayload {
  wheelId: WheelId;
  center: { x: number; y: number };
  diameter: number;
  flags: { office: boolean; heic: boolean };
}

function App() {
  const settings = useSettings((s) => s.settings);
  const init = useSettings((s) => s.init);
  const [open, setOpen] = useState<OpenPayload | null>(null);
  const [mimes, setMimes] = useState<string[] | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const modelRef = useRef<ReturnType<typeof buildWheel> | null>(null);

  useEffect(() => {
    void init();
    const offOpen = on<OpenPayload>('overlay:open', (p) => {
      setOpen(p);
      setMimes(null);
      setHovered(null);
      setNotice(null);
    });
    const offSwitch = on<{ wheelId: WheelId }>('overlay:switch', (p) => {
      setOpen((o) => (o ? { ...o, wheelId: p.wheelId } : o));
      setHovered(null);
    });
    const offClose = on('overlay:close', () => {
      setOpen(null);
      setMimes(null);
      setHovered(null);
    });
    return () => {
      offOpen();
      offSwitch();
      offClose();
    };
  }, [init]);

  const prefs = useMemo(
    () => ({ order: settings?.wheels.order ?? {}, disabled: settings?.wheels.disabled ?? {} }),
    [settings?.wheels],
  );
  const model = useMemo(() => {
    if (!open) return null;
    return buildWheel(
      open.wheelId,
      mimes === null ? null : itemsFromMimeTypes(mimes),
      prefs,
      open.flags,
    );
  }, [open, mimes, prefs]);
  modelRef.current = model;

  const hit = useCallback(
    (x: number, y: number) => {
      if (!open || !model) return null;
      const r = open.diameter / 2;
      const result = hitTest(
        { x, y },
        {
          center: open.center,
          innerRadius: r * HOLE,
          outerRadius: r * RING,
          wedgeCount: model.wedges.length,
        },
      );
      return result;
    },
    [open, model],
  );

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (mimes === null) {
      const types = Array.from(e.dataTransfer.items)
        .filter((i) => i.kind === 'file')
        .map((i) => i.type);
      setMimes(types);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    // Safety rule: never offer Move, or the source app might delete the original (docs/02 section 6).
    e.dataTransfer.dropEffect = 'copy';
    if (mimes === null) onDragEnter(e);
    const result = hit(e.clientX, e.clientY);
    const next =
      result?.kind === 'wedge' && model?.wedges[result.index]?.enabled ? result.index : null;
    setHovered((h) => (h === next ? h : next));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const result = hit(e.clientX, e.clientY);
    const files = Array.from(e.dataTransfer.files);
    if (!open || !model) return void invoke('overlay:cancel');
    if (files.length === 0) {
      setNotice("This item isn't a file on disk.");
      return void invoke('overlay:cancel', { reason: 'not-on-disk' });
    }
    if (result?.kind === 'wedge' && model.wedges[result.index]?.enabled) {
      const wedge = model.wedges[result.index];
      const paths = files.map((f) => pathForFile(f)).filter((p) => p !== '');
      if (paths.length === 0) return void invoke('overlay:cancel', { reason: 'not-on-disk' });
      return void invoke('overlay:drop', {
        wheelId: open.wheelId,
        wedgeId: (wedge as { id: string }).id,
        paths,
      });
    }
    // A drop in the hole, in a disabled wedge, or outside the wheel cancels. Nothing happens to the file.
    void invoke('overlay:cancel');
  };

  const animate = settings?.appearance.animations === 'full';
  return (
    <div
      className="h-full w-full overflow-hidden"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {open && model && settings && (
        <div
          className="absolute"
          style={{
            left: open.center.x - open.diameter / 2,
            top: open.center.y - open.diameter / 2,
            transform: 'scale(1)',
            animation: animate ? 'wheel-in 120ms ease-out' : undefined,
          }}
        >
          <Wheel
            wedges={model.wedges}
            hovered={hovered}
            diameter={open.diameter}
            style={settings.appearance.wheelStyle}
            opacity={settings.appearance.wheelOpacity}
            title={
              notice ?? (mimes ? sourceLabel(itemsFromMimeTypes(mimes)) : undefined) ?? model.title
            }
            hint={notice ? undefined : model.hint}
            disabled={model.disabled}
          />
        </div>
      )}
      <style>{`@keyframes wheel-in { from { transform: scale(.92); opacity: 0 } to { transform: scale(1); opacity: 1 } } html,body{background:transparent!important}`}</style>
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
