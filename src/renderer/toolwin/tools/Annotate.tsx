import {
  ArrowUpRight,
  Circle,
  Hash,
  Minus,
  MousePointer2,
  Square,
  Type,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, ColorInput, Field, inputCls, Slider } from '../../components/ui';
import { invoke } from '../../shared/api';
import { drawAll, drawShape, type Shape, type ShapeKind } from '../annotate-draw';
import { ToolFrame, useImage, type LoadedImage } from '../kit';

const TOOL_LIST: { kind: ShapeKind; label: string; icon: typeof Minus }[] = [
  { kind: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { kind: 'line', label: 'Line', icon: Minus },
  { kind: 'rect', label: 'Rectangle', icon: Square },
  { kind: 'ellipse', label: 'Ellipse', icon: Circle },
  { kind: 'text', label: 'Text', icon: Type },
  { kind: 'callout', label: 'Numbered callout', icon: Hash },
];

export function Annotate({ paths }: { paths: string[] }) {
  const file = paths[0] as string;
  const image = useImage(file);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [kind, setKind] = useState<ShapeKind>('arrow');
  const [color, setColor] = useState('#FF3B30');
  const [size, setSize] = useState(5);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [typing, setTyping] = useState<{ x: number; y: number; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loaded = image && image !== 'error' ? (image as LoadedImage) : null;
  // The preview works in image pixels and is only scaled by CSS, so what you see is what is exported.
  const strokeWidth = loaded ? Math.max(1, Math.round((size / 5) * (loaded.width / 160))) : size;

  useEffect(() => {
    if (!loaded || !canvas.current) return;
    const c = canvas.current;
    c.width = loaded.width;
    c.height = loaded.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(loaded.el, 0, 0);
    drawAll(ctx, shapes);
    if (draft) drawShape(ctx, draft);
  }, [loaded, shapes, draft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'z' &&
        !(e.target instanceof HTMLInputElement)
      )
        setShapes((s) => s.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!loaded) {
    return (
      <ToolFrame tool="annotate" canRun={false} onRun={() => undefined}>
        <p className="text-sm text-muted">
          {image === 'error' ? 'This image could not be previewed.' : 'Loading…'}
        </p>
      </ToolFrame>
    );
  }
  const point = (e: React.PointerEvent): { x: number; y: number } => {
    const r = (canvas.current as HTMLCanvasElement).getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * loaded.width,
      y: ((e.clientY - r.top) / r.height) * loaded.height,
    };
  };
  const nextNumber = shapes.filter((s) => s.kind === 'callout').length + 1;

  const commitText = () => {
    if (typing && typing.text.trim() !== '') {
      setShapes((s) => [
        ...s,
        {
          kind: 'text',
          color,
          width: strokeWidth,
          x1: typing.x,
          y1: typing.y,
          x2: typing.x,
          y2: typing.y,
          text: typing.text,
        },
      ]);
    }
    setTyping(null);
  };

  const exportImage = async () => {
    setBusy(true);
    try {
      const out = document.createElement('canvas');
      out.width = loaded.width;
      out.height = loaded.height;
      const ctx = out.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(loaded.el, 0, 0);
      drawAll(ctx, shapes);
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
      if (!blob) return;
      await invoke('annotate:save', {
        sourcePath: file,
        data: new Uint8Array(await blob.arrayBuffer()),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolFrame
      tool="annotate"
      runLabel="Save a copy"
      canRun={shapes.length > 0}
      busy={busy}
      onRun={() => void exportImage()}
      side={
        <>
          <Field label="Tool">
            <div className="grid grid-cols-3 gap-1.5">
              {TOOL_LIST.map((t) => (
                <button
                  key={t.kind}
                  aria-pressed={kind === t.kind}
                  title={t.label}
                  onClick={() => {
                    commitText();
                    setKind(t.kind);
                  }}
                  className={`no-drag flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px] ${kind === t.kind ? 'border-accent bg-accent-soft' : 'border-line bg-surface2 hover:border-accent'}`}
                >
                  <t.icon size={16} /> {t.label.replace('Numbered ', '')}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Colour">
            <ColorInput label="Annotation colour" value={color} onChange={setColor} />
          </Field>
          <Field label="Size">
            <Slider label="Size" value={size} min={1} max={12} onChange={setSize} />
          </Field>
          <div className="flex gap-2">
            <Button onClick={() => setShapes((s) => s.slice(0, -1))} disabled={shapes.length === 0}>
              <Undo2 size={14} /> Undo
            </Button>
            <Button variant="ghost" onClick={() => setShapes([])} disabled={shapes.length === 0}>
              Clear
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">
            <MousePointer2 size={12} className="mr-1 inline" />
            Drag on the photo to draw. Click to place text or a numbered callout. Ctrl+Z undoes.
          </p>
        </>
      }
    >
      <div className="relative mx-auto max-w-[640px] select-none">
        <canvas
          ref={canvas}
          aria-label="Annotation canvas"
          className="block w-full cursor-crosshair rounded"
          onPointerDown={(e) => {
            const p = point(e);
            if (kind === 'text') {
              commitText();
              setTyping({ x: p.x, y: p.y, text: '' });
              return;
            }
            if (kind === 'callout') {
              setShapes((s) => [
                ...s,
                {
                  kind,
                  color,
                  width: strokeWidth,
                  x1: p.x,
                  y1: p.y,
                  x2: p.x,
                  y2: p.y,
                  n: nextNumber,
                },
              ]);
              return;
            }
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setDraft({ kind, color, width: strokeWidth, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
          }}
          onPointerMove={(e) => draft && setDraft({ ...draft, x2: point(e).x, y2: point(e).y })}
          onPointerUp={() => {
            if (draft && Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 4)
              setShapes((s) => [...s, draft]);
            setDraft(null);
          }}
        />
        {typing && (
          <input
            autoFocus
            aria-label="Annotation text"
            value={typing.text}
            placeholder="Type, then press Enter"
            onChange={(e) => setTyping({ ...typing, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitText();
              if (e.key === 'Escape') setTyping(null);
            }}
            onBlur={commitText}
            className={`${inputCls} absolute w-48`}
            style={{
              left: `${(typing.x / loaded.width) * 100}%`,
              top: `${(typing.y / loaded.height) * 100}%`,
            }}
          />
        )}
      </div>
    </ToolFrame>
  );
}
