import { useMemo, useRef, useState } from 'react';
import { type Category, type WheelId } from '../../shared/formats';
import { Wheel, HOLE, RING, type WheelStyle } from './Wheel';
import { buildWheel, type Prefs } from '../overlay/wedges';
import { hitTest } from '../overlay/hit-test';
import { SAMPLE_FILE } from '../shared/categories';
import { itemsFromMimeTypes } from '../../shared/formats';

/** The same Wheel component as the overlay, with a sample selection, driven by the draft settings. */
export function WheelPreview({
  wheel,
  category,
  style,
  opacity,
  size = 240,
  prefs,
  flags = { office: true, heic: true },
}: {
  wheel: WheelId;
  category: Category;
  style: WheelStyle;
  opacity: number;
  size?: number;
  prefs: Prefs;
  flags?: { office: boolean; heic: boolean };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const model = useMemo(() => {
    const sample = SAMPLE_FILE[category];
    return buildWheel(wheel, [{ path: sample, isDirectory: false }], prefs, flags);
  }, [wheel, category, prefs, flags]);
  void itemsFromMimeTypes;
  return (
    <div
      ref={ref}
      className="mx-auto"
      style={{ width: size, height: size }}
      onMouseMove={(e) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        const r = size / 2;
        const result = hitTest(
          { x: e.clientX - rect.left, y: e.clientY - rect.top },
          {
            center: { x: r, y: r },
            innerRadius: r * HOLE,
            outerRadius: r * RING,
            wedgeCount: model.wedges.length,
          },
        );
        setHovered(result.kind === 'wedge' ? result.index : null);
      }}
      onMouseLeave={() => setHovered(null)}
    >
      <Wheel
        wedges={model.wedges}
        hovered={hovered}
        diameter={size}
        style={style}
        opacity={opacity}
        title={model.title}
        hint={model.hint}
        disabled={model.disabled}
      />
    </div>
  );
}
