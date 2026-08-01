/**
 * Cumulative atom count over recent weeks — the "is this thing actually
 * learning?" line. Deliberately a plain server-rendered SVG: it's a static
 * shape with no interaction, so shipping a charting library (or even a
 * client component) for it would be pure overhead.
 */
export function GrowthSparkline({
  points,
  height = 48,
}: {
  points: { week: string; total: number }[];
  height?: number;
}) {
  if (points.length < 2) return null;

  const width = 100; // viewBox units; the SVG scales to its container
  const max = Math.max(...points.map((p) => p.total), 1);
  const stepX = width / (points.length - 1);

  const coords = points.map((p, i) => ({
    x: i * stepX,
    y: height - (p.total / max) * (height - 6) - 3,
  }));

  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = coords[coords.length - 1];

  return (
    <div className="flex items-end gap-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-12 flex-1"
        aria-label={`Knowledge growth: ${points[points.length - 1].total} atoms`}
      >
        <defs>
          <linearGradient id="growth-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#growth-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={last.x} cy={last.y} r="2" fill="var(--color-accent)" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="shrink-0 text-2xl font-bold tabular-nums text-fg">
        {points[points.length - 1].total}
      </span>
    </div>
  );
}
