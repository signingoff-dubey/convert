import { ScanFace, ScanText, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Box } from '../../../shared/image-math';
import { Button, ColorInput, Field, SegmentedControl } from '../../components/ui';
import { invoke } from '../../shared/api';
import { run, ToolFrame, useImage, type LoadedImage } from '../kit';

type FaceApi = typeof import('@vladmandic/face-api');
let faceApi: Promise<FaceApi> | null = null;

/** Loads the bundled tiny face detector. The weights come from main over IPC, so nothing is fetched. */
async function loadFaceDetector(): Promise<FaceApi> {
  faceApi ??= (async () => {
    const api = await import('@vladmandic/face-api');
    const { manifest, weights } = await invoke('detect:face-model');
    const specs = (manifest as { weights: unknown[] }[])[0]?.weights ?? [];
    const buffer = weights.buffer.slice(
      weights.byteOffset,
      weights.byteOffset + weights.byteLength,
    ) as ArrayBuffer;
    const map = api.tf.io.decodeWeights(buffer, specs as never);
    await api.nets.tinyFaceDetector.loadFromWeightMap(map as never);
    return api;
  })();
  return faceApi;
}

export function Redact({ paths }: { paths: string[] }) {
  const file = paths[0] as string;
  const image = useImage(file);
  const stage = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<'solid' | 'blur'>('solid');
  const [color, setColor] = useState('#000000');
  const [draft, setDraft] = useState<Box | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selected !== null &&
        !(e.target instanceof HTMLInputElement)
      ) {
        setBoxes((b) => b.filter((_, i) => i !== selected));
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  if (!image || image === 'error') {
    return (
      <ToolFrame tool="redact" canRun={false} onRun={() => undefined}>
        <p className="text-sm text-muted">
          {image === 'error' ? 'This image could not be previewed.' : 'Loading…'}
        </p>
      </ToolFrame>
    );
  }
  const { width, height, el } = image as LoadedImage;
  const toNatural = (e: React.PointerEvent): { x: number; y: number } => {
    const r = (stage.current as HTMLDivElement).getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(width, ((e.clientX - r.left) / r.width) * width)),
      y: Math.max(0, Math.min(height, ((e.clientY - r.top) / r.height) * height)),
    };
  };
  const pct = (b: Box) => ({
    left: `${(b.x / width) * 100}%`,
    top: `${(b.y / height) * 100}%`,
    width: `${(b.w / width) * 100}%`,
    height: `${(b.h / height) * 100}%`,
  });

  const detectText = async () => {
    setBusy(true);
    setStatus('Looking for text on this computer…');
    try {
      const found = await invoke('detect:text', { path: file });
      setBoxes((b) => [...b, ...found]);
      setStatus(
        found.length
          ? `Found ${found.length} word${found.length === 1 ? '' : 's'}. Delete any you want to keep visible.`
          : 'No text was found.',
      );
    } catch {
      setStatus('Text detection is not available. Draw boxes by hand instead.');
    } finally {
      setBusy(false);
    }
  };
  const detectFaces = async () => {
    setBusy(true);
    setStatus('Looking for faces on this computer…');
    try {
      const api = await loadFaceDetector();
      const found = await api.detectAllFaces(
        el,
        new api.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.4 }),
      );
      const padded = found.map(({ box }) => {
        const px = box.width * 0.2;
        const py = box.height * 0.25;
        const x = Math.max(0, box.x - px);
        const y = Math.max(0, box.y - py);
        return {
          x: Math.round(x),
          y: Math.round(y),
          w: Math.round(Math.min(width - x, box.width + 2 * px)),
          h: Math.round(Math.min(height - y, box.height + 2 * py)),
        };
      });
      setBoxes((b) => [...b, ...padded]);
      setStatus(
        padded.length
          ? `Found ${padded.length} face${padded.length === 1 ? '' : 's'}. Check them, and add any that were missed.`
          : 'No faces were found. Draw boxes by hand if needed.',
      );
    } catch {
      setStatus('Face detection is not available on this computer. Draw boxes by hand instead.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolFrame
      tool="redact"
      runLabel="Redact"
      canRun={boxes.length > 0}
      onRun={() => void run('redact', paths, { mode, color, boxes: JSON.stringify(boxes) })}
      side={
        <>
          <p className="mb-3 text-sm text-muted">
            Detection runs on this computer. Nothing is uploaded. Always check the result before
            sharing.
          </p>
          <div className="mb-3 flex flex-col gap-2">
            <Button disabled={busy} onClick={() => void detectFaces()}>
              <ScanFace size={14} /> Detect faces
            </Button>
            <Button disabled={busy} onClick={() => void detectText()}>
              <ScanText size={14} /> Detect text
            </Button>
            <Button
              variant="danger"
              disabled={boxes.length === 0}
              onClick={() => {
                setBoxes([]);
                setSelected(null);
              }}
            >
              <Trash2 size={14} /> Clear all
            </Button>
          </div>
          {status && (
            <p className="mb-3 text-xs text-muted" role="status">
              {status}
            </p>
          )}
          <Field label="Cover with">
            <SegmentedControl
              label="Cover"
              value={mode}
              options={[
                { value: 'solid', label: 'Solid colour' },
                { value: 'blur', label: 'Blur' },
              ]}
              onChange={setMode}
            />
          </Field>
          {mode === 'solid' && (
            <Field label="Colour">
              <ColorInput label="Cover colour" value={color} onChange={setColor} />
            </Field>
          )}
          <p className="text-xs text-muted">
            {boxes.length} area{boxes.length === 1 ? '' : 's'} selected. Drag on the photo to add
            one; click one and press Delete to remove it.
          </p>
        </>
      }
    >
      <div
        ref={stage}
        className="relative mx-auto max-w-[600px] cursor-crosshair select-none"
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget && !(e.target instanceof HTMLImageElement)) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          start.current = toNatural(e);
          setSelected(null);
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const p = toNatural(e);
          setDraft({
            x: Math.min(start.current.x, p.x),
            y: Math.min(start.current.y, p.y),
            w: Math.abs(p.x - start.current.x),
            h: Math.abs(p.y - start.current.y),
          });
        }}
        onPointerUp={() => {
          if (draft && draft.w > 6 && draft.h > 6)
            setBoxes((b) => [
              ...b,
              {
                x: Math.round(draft.x),
                y: Math.round(draft.y),
                w: Math.round(draft.w),
                h: Math.round(draft.h),
              },
            ]);
          start.current = null;
          setDraft(null);
        }}
      >
        <img src={image.src} alt="Photo to redact" draggable={false} className="block w-full" />
        {boxes.map((b, i) => (
          <button
            key={`${b.x}-${b.y}-${i}`}
            aria-label={`Redaction area ${i + 1}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelected(i);
            }}
            className={`absolute ${selected === i ? 'outline outline-2 outline-offset-1 outline-accent' : ''}`}
            style={{
              ...pct(b),
              background: mode === 'solid' ? color : 'rgba(255,255,255,0.12)',
              backdropFilter: mode === 'blur' ? 'blur(10px)' : undefined,
            }}
          />
        ))}
        {draft && (
          <div
            className="pointer-events-none absolute border-2 border-dashed border-white"
            style={pct(draft)}
          />
        )}
      </div>
    </ToolFrame>
  );
}
