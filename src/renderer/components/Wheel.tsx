import type { LucideIcon } from 'lucide-react';
import { labelPoint, roundedSectorPath } from './wheel-geometry';

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
  /** Shown in the centre capsule when nothing is hovered: the dragged file's own extension, or the wheel name. */
  title: string;
  /** Small line under the capsule, such as "Select one type". */
  hint?: string;
  /** Greyed out: the wheel opened but cannot act on this selection. */
  disabled?: boolean;
}

const TAU = Math.PI * 2;

/** Fractions of the wheel's radius. Shared with hit-testing, so what you see is what you hit. */
export const HOLE = 0.38;
export const RING = 0.9;

/** Smaller type for long labels on crowded or small wheels, so neighbouring labels never collide. */
export function labelSize(label: string, diameter: number, count: number): number {
  const labelRadius = (diameter / 2) * (HOLE + (RING - HOLE) * 0.56);
  const chord = 2 * labelRadius * Math.sin(Math.PI / Math.max(count, 3));
  const natural = diameter < 260 ? 10.5 : 12;
  const fit = (chord * 0.92) / (Math.max(label.length, 3) * 0.72);
  return Math.max(8, Math.min(natural, Math.round(fit * 10) / 10));
}

/**
 * The wheel: a full circle with a rim, and rounded pie sections inside it. Plain SVG; hit-testing is angle
 * maths in the container, not DOM events on sections.
 */
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
  const r1 = c * RING;
  const r0 = c * HOLE;
  const disc = c * 0.985;
  const gap = Math.max(2, diameter * 0.011);
  const corner = diameter * 0.052;
  const count = Math.max(wedges.length, 1);
  const centre = hovered !== null ? (wedges[hovered]?.label ?? title) : title;
  const outline = style === 'outline';
  const uid = `w${diameter}`;

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
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0"
              style={{ stopColor: 'color-mix(in srgb, var(--surface) 88%, white)' }}
            />
            <stop offset="1" style={{ stopColor: 'var(--surface-2)' }} />
          </linearGradient>
          <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0"
              style={{ stopColor: 'color-mix(in srgb, var(--surface) 80%, white)' }}
            />
            <stop
              offset="1"
              style={{ stopColor: 'color-mix(in srgb, var(--border) 85%, var(--surface-2))' }}
            />
          </linearGradient>
          <filter id={`${uid}-lift`} x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow
              dx="0"
              dy="1.2"
              stdDeviation="1.4"
              floodColor="#000"
              floodOpacity="0.22"
            />
          </filter>
          <filter id={`${uid}-shadow`} x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="8" stdDeviation="9" floodColor="#000" floodOpacity="0.32" />
          </filter>
        </defs>

        {/* The full circle: a light rim with a darker groove inside it that the sections sit in. */}
        {!outline && (
          <>
            <circle
              cx={c}
              cy={c}
              r={disc}
              fill={`url(#${uid}-rim)`}
              stroke="var(--border)"
              strokeWidth={1}
              filter={style === 'glass' ? `url(#${uid}-shadow)` : undefined}
            />
            <circle
              cx={c}
              cy={c}
              r={r1 + gap * 1.6}
              fill="color-mix(in srgb, var(--border) 75%, var(--surface-2))"
            />
          </>
        )}
        {outline && (
          <circle cx={c} cy={c} r={disc} fill="none" stroke="var(--accent)" strokeWidth={2} />
        )}

        {wedges.map((w, i) => {
          const a0 = (i / count) * TAU;
          const a1 = count === 1 ? TAU - 0.05 : ((i + 1) / count) * TAU;
          const active = hovered === i && w.enabled;
          const [lx, ly] = labelPoint(c, c, r0, r1, a0, a1);
          const Icon = w.icon;
          const fill = active ? 'var(--accent)' : outline ? 'transparent' : `url(#${uid}-fill)`;
          return (
            <g key={w.id}>
              <path
                d={roundedSectorPath(c, c, r0, r1, a0, a1, gap, corner)}
                fill={fill}
                stroke={
                  active
                    ? 'var(--accent)'
                    : outline
                      ? 'var(--accent)'
                      : 'color-mix(in srgb, var(--border) 60%, transparent)'
                }
                strokeWidth={outline ? 1.5 : 1}
                filter={!outline && !active && style === 'glass' ? `url(#${uid}-lift)` : undefined}
                style={{ transition: 'fill 90ms ease-out', opacity: w.enabled ? 1 : 0.45 }}
              />
              {Icon && (
                <Icon
                  x={lx - 9}
                  y={ly - 21}
                  size={18}
                  color={active ? 'var(--on-accent)' : 'var(--text)'}
                  strokeWidth={1.8}
                />
              )}
              <text
                x={lx}
                y={Icon ? ly + 9 : ly + 4.5}
                textAnchor="middle"
                fontSize={labelSize(w.label, diameter, count)}
                fontWeight={700}
                letterSpacing={0.3}
                fill={active ? 'var(--on-accent)' : 'var(--text)'}
                style={{
                  pointerEvents: 'none',
                  textTransform: 'uppercase',
                  transition: 'fill 90ms ease-out',
                }}
              >
                {w.label}
              </text>
            </g>
          );
        })}

        {/* The hole. */}
        <circle
          cx={c}
          cy={c}
          r={r0 - gap * 0.4}
          fill={outline ? 'none' : 'var(--surface)'}
          stroke="var(--border)"
          strokeWidth={1}
        />
      </svg>

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
        style={{ width: r0 * 2 - 10 }}
      >
        <span
          className="max-w-full truncate rounded-full border border-line bg-surface px-3 py-1 text-center font-bold uppercase leading-none tracking-wide shadow-sm"
          style={{
            fontSize: centre.length > 6 ? 10 : 12.5,
            color: hovered !== null ? 'var(--accent)' : 'var(--text)',
            transition: 'color 90ms ease-out',
          }}
        >
          {centre}
        </span>
        {hint && hovered === null && (
          <span className="mt-1 text-center text-[9.5px] leading-tight text-muted">{hint}</span>
        )}
      </div>
    </div>
  );
}
