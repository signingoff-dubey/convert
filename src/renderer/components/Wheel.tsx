import type { LucideIcon } from 'lucide-react';

export interface WedgeView {
  id: string;
  label: string;
  icon?: LucideIcon;
  enabled: boolean;
}

export type WheelStyle = 'glass' | 'solid' | 'outline';

export interface WheelProps {
  wedges: readonly WedgeView[];
  hovered: number | null;
  diameter: number;
  style: WheelStyle;
  opacity: number;
  /** Shown in the centre pill when nothing is hovered. */
  title: string;
  /** Small second line under the title, such as "Select one type". */
  hint?: string;
  /** Greyed out: the wheel opened but cannot act on this selection. */
  disabled?: boolean;
}

const TAU = Math.PI * 2;
const GAP_PX = 5;

const polar = (cx: number, cy: number, r: number, a: number): [number, number] => [
  cx + r * Math.sin(a),
  cy - r * Math.cos(a),
];

/** Annular sector from angle a0 to a1 (radians clockwise from 12 o'clock), leaving a fixed pixel gap. */
export function wedgePath(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
): string {
  const g0 = GAP_PX / 2 / r1;
  const g1 = GAP_PX / 2 / r0;
  const [x0, y0] = polar(cx, cy, r1, a0 + g0);
  const [x1, y1] = polar(cx, cy, r1, a1 - g0);
  const [x2, y2] = polar(cx, cy, r0, a1 - g1);
  const [x3, y3] = polar(cx, cy, r0, a0 + g1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`;
}

/** Smaller type for long labels on crowded or small wheels, so neighbouring labels never collide. */
export function labelSize(label: string, diameter: number, count: number): number {
  const chord = (diameter / 2) * 0.67 * 2 * Math.sin(Math.PI / Math.max(count, 3));
  const natural = diameter < 260 ? 10.5 : 12;
  const fit = (chord * 0.92) / (Math.max(label.length, 3) * 0.72);
  return Math.max(8, Math.min(natural, Math.round(fit * 10) / 10));
}

/** Fractions of the radius where the hole ends and the ring ends. Shared with hit-testing. */
export const HOLE = 0.36;
export const RING = 0.97;

/** The wheel: plain SVG. Hit-testing is angle maths in the container, not DOM events on wedges. */
export function Wheel({
  wedges,
  hovered,
  diameter,
  style,
  opacity,
  title,
  hint,
  disabled,
}: WheelProps) {
  const c = diameter / 2;
  const outer = c * RING;
  const inner = c * HOLE;
  const count = Math.max(wedges.length, 1);
  const centreLabel = hovered !== null ? (wedges[hovered]?.label ?? title) : title;
  const fill =
    style === 'outline'
      ? 'transparent'
      : style === 'solid'
        ? 'var(--surface)'
        : 'color-mix(in srgb, var(--surface) 78%, transparent)';
  const stroke = style === 'outline' ? 'var(--accent)' : 'var(--border)';

  return (
    <div
      className="relative"
      style={{ width: diameter, height: diameter, opacity: disabled ? 0.55 : opacity }}
    >
      <svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        className="absolute inset-0 overflow-visible"
      >
        {style === 'glass' && (
          <circle
            cx={c}
            cy={c}
            r={outer + 3}
            fill="color-mix(in srgb, var(--bg) 55%, transparent)"
            style={{ filter: 'drop-shadow(0 8px 22px rgb(0 0 0 / 0.35))' }}
          />
        )}
        {wedges.map((w, i) => {
          const a0 = (i / count) * TAU;
          const a1 = ((i + 1) / count) * TAU;
          const active = hovered === i && w.enabled;
          const mid = (a0 + a1) / 2;
          // Labels sit a little outside the middle of the ring, where wedges are widest.
          const [lx, ly] = polar(c, c, inner + (outer - inner) * 0.56, mid);
          const Icon = w.icon;
          return (
            <g key={w.id} style={{ transition: 'all 90ms ease-out' }}>
              <path
                d={wedgePath(c, c, inner, outer, a0, a1)}
                fill={active ? 'var(--accent)' : fill}
                stroke={active ? 'var(--accent)' : stroke}
                strokeWidth={style === 'outline' ? 2 : 1}
                strokeLinejoin="round"
                style={{ transition: 'fill 90ms ease-out', opacity: w.enabled ? 1 : 0.45 }}
              />
              {Icon && (
                <Icon
                  x={lx - 9}
                  y={ly - 20}
                  size={18}
                  color={active ? 'var(--on-accent)' : 'var(--text)'}
                  strokeWidth={1.8}
                />
              )}
              <text
                x={lx}
                y={Icon ? ly + 8 : ly + 5}
                textAnchor="middle"
                fontSize={labelSize(w.label, diameter, count)}
                fontWeight={700}
                letterSpacing={0.4}
                fill={active ? 'var(--on-accent)' : 'var(--text)'}
                style={{ pointerEvents: 'none', textTransform: 'uppercase' }}
              >
                {w.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div
        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-line bg-surface text-center shadow-md"
        style={{ width: inner * 2 - 14, height: inner * 2 - 14, transition: 'all 90ms ease-out' }}
      >
        <span
          className="px-2 text-[11px] font-bold uppercase leading-tight tracking-wide"
          style={{ color: hovered !== null ? 'var(--accent)' : 'var(--text)' }}
        >
          {centreLabel}
        </span>
        {hint && hovered === null && (
          <span className="mt-0.5 px-3 text-[9.5px] leading-tight text-muted">{hint}</span>
        )}
      </div>
    </div>
  );
}
