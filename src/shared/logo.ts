/** The Convert mark: a ring of six wedges with a gap between them. Drawn here, not taken from anywhere. */
export function logoSvg(size: number, accent = '#7C5CFF', busyDot = false): string {
  const c = size / 2;
  const outer = size * 0.46;
  const inner = size * 0.2;
  const wedges = Array.from({ length: 6 }, (_, i) => {
    const gap = 0.09;
    const a0 = (i / 6) * Math.PI * 2 - Math.PI / 2 + gap;
    const a1 = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2 - gap;
    const p = (r: number, a: number): string =>
      `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
    const fill = i === 0 ? accent : '#9aa0b2';
    return `<path d="M ${p(outer, a0)} A ${outer} ${outer} 0 0 1 ${p(outer, a1)} L ${p(inner, a1)} A ${inner} ${inner} 0 0 0 ${p(inner, a0)} Z" fill="${fill}"/>`;
  }).join('');
  const dot = busyDot
    ? `<circle cx="${size * 0.82}" cy="${size * 0.82}" r="${size * 0.16}" fill="#3DDC97" stroke="#14151A" stroke-width="${size * 0.04}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${wedges}${dot}</svg>`;
}
