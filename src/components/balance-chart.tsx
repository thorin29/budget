/**
 * The bills balance over the projection window, drawn as a step line: the
 * balance only changes on days something comes in or goes out.
 *
 * Plain SVG with no client code, so it renders on the server. The projection
 * page reuses it at a larger size with paydays marked.
 */

export interface ChartPoint {
  /** Days from the start of the window. */
  day: number;
  balanceCents: number;
}

export function BalanceChart({
  opening,
  points,
  horizonDays,
  lowDay,
  paydays = [],
  height = 72,
  showAxis = false,
  labels,
}: {
  opening: number;
  points: ChartPoint[];
  horizonDays: number;
  lowDay: number | null;
  paydays?: number[];
  height?: number;
  showAxis?: boolean;
  /** Text under the axis at the start, middle and end. */
  labels?: [string, string, string];
}) {
  const width = 600;
  const pad = 6;
  const values = [opening, ...points.map((p) => p.balanceCents), 0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const x = (day: number) => pad + (day / Math.max(horizonDays, 1)) * (width - pad * 2);
  const y = (cents: number) => pad + (1 - (cents - min) / span) * (height - pad * 2);

  let d = `M ${x(0)} ${y(opening)}`;
  for (const p of points) {
    d += ` H ${x(p.day)} V ${y(p.balanceCents)}`;
  }
  d += ` H ${x(horizonDays)}`;

  const area = `${d} V ${height} H ${x(0)} Z`;
  const low = lowDay === null ? null : points.find((p) => p.day === lowDay) ?? null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
        role="img"
        aria-label="Projected bills balance"
      >
        {min < 0 ? (
          <line
            x1={0}
            x2={width}
            y1={y(0)}
            y2={y(0)}
            stroke="var(--danger)"
            strokeDasharray="4 4"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {paydays.map((day) => (
          <line
            key={day}
            x1={x(day)}
            x2={x(day)}
            y1={0}
            y2={height}
            stroke="var(--info)"
            strokeOpacity={0.35}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={area} fill="var(--accent)" fillOpacity={0.1} />
        <path
          d={d}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </svg>
      {low ? (
        // Drawn in HTML so the stretched SVG does not squash it into an oval.
        <span
          aria-hidden
          className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface ${
            low.balanceCents < 0 ? "bg-danger" : "bg-over"
          }`}
          style={{ left: `${(x(low.day) / width) * 100}%`, top: y(low.balanceCents) }}
        />
      ) : null}
      {showAxis && labels ? (
        <div className="mt-1.5 flex justify-between text-[11px] text-subtle">
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
          <span>{labels[2]}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Projection days to chart points, counted from the start of the window. */
export function toChartPoints(
  asOf: Date,
  days: Array<{ date: Date; balanceCents: number }>,
): ChartPoint[] {
  const start = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  return days.map((d) => ({
    day: Math.round((d.date.getTime() - start) / 86_400_000),
    balanceCents: d.balanceCents,
  }));
}
