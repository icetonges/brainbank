import type { ClassroomCategory } from "@/lib/db/schema";

/**
 * All front-page artwork is inline SVG drawn with the theme's CSS variables
 * (--color-accent, --color-border, ...), so it adapts to light/dark mode
 * automatically and ships zero image bytes.
 */

/** The hero's knowledge-graph: layered nodes (capture → connect → learn)
 * with gold synapse lines — half neural network, half note graph. */
export function HeroVisual() {
  const line = "var(--color-border)";
  const gold = "var(--color-accent)";

  const edges: [number, number, number, number][] = [
    // input layer -> hidden layer
    [60, 60, 200, 40], [60, 60, 200, 120], [60, 140, 200, 40], [60, 140, 200, 120],
    [60, 140, 200, 200], [60, 220, 200, 120], [60, 220, 200, 200], [60, 300, 200, 200],
    [60, 300, 200, 280], [60, 220, 200, 280],
    // hidden layer -> output layer
    [200, 40, 340, 100], [200, 120, 340, 100], [200, 120, 340, 180],
    [200, 200, 340, 180], [200, 200, 340, 260], [200, 280, 340, 260],
    [200, 40, 340, 180], [200, 280, 340, 180],
  ];

  return (
    <svg
      viewBox="0 0 400 340"
      role="img"
      aria-label="A knowledge graph: captured sources connecting into structured AI knowledge"
      className="h-auto w-full max-w-md"
    >
      {/* soft halo behind the network */}
      <circle cx="200" cy="170" r="150" fill={gold} opacity="0.05" />
      <circle cx="200" cy="170" r="105" fill={gold} opacity="0.05" />

      {edges.map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={i % 3 === 0 ? gold : line}
          strokeOpacity={i % 3 === 0 ? 0.55 : 0.9}
          strokeWidth="1.2"
        />
      ))}

      {/* input layer — raw captures */}
      {[60, 140, 220, 300].map((y) => (
        <g key={y}>
          <circle cx="60" cy={y} r="11" fill="var(--color-bg-elevated)" stroke={line} strokeWidth="1.5" />
          <circle cx="60" cy={y} r="3.5" fill={gold} opacity="0.8" />
        </g>
      ))}

      {/* hidden layer — connections forming */}
      {[40, 120, 200, 280].map((y, i) => (
        <g key={y}>
          <circle cx="200" cy={y} r="14" fill="var(--color-bg-elevated)" stroke={gold} strokeWidth="1.5" strokeOpacity="0.7" />
          <circle cx="200" cy={y} r="5" fill={gold} opacity={0.5 + i * 0.12} />
        </g>
      ))}

      {/* output layer — structured knowledge */}
      {[100, 180, 260].map((y) => (
        <g key={y}>
          <circle cx="340" cy={y} r="17" fill={gold} opacity="0.14" />
          <circle cx="340" cy={y} r="17" fill="none" stroke={gold} strokeWidth="1.5" />
          <circle cx="340" cy={y} r="6.5" fill={gold} />
        </g>
      ))}

      {/* pulse accents */}
      <circle cx="200" cy="120" r="20" fill="none" stroke={gold} strokeWidth="1" opacity="0.35" className="animate-ping [animation-duration:3s]" />
      <circle cx="340" cy="180" r="24" fill="none" stroke={gold} strokeWidth="1" opacity="0.3" className="animate-ping [animation-duration:4s]" />

      {/* layer captions */}
      <text x="60" y="330" textAnchor="middle" fontSize="11" fill="var(--color-fg-secondary)">capture</text>
      <text x="200" y="330" textAnchor="middle" fontSize="11" fill="var(--color-fg-secondary)">connect</text>
      <text x="340" y="330" textAnchor="middle" fontSize="11" fill="var(--color-fg-secondary)">learn</text>
    </svg>
  );
}

/** Stroke icons for the three pillars. Inherit color via currentColor. */
export function PillarIcon({ kind }: { kind: "ai" | "km" | "cm" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-7 w-7",
    "aria-hidden": true,
  };

  if (kind === "ai") {
    // brain-circuit
    return (
      <svg {...common}>
        <path d="M12 4a3.5 3.5 0 0 0-3.5 3.5c-1.8.3-3 1.8-3 3.6 0 1 .4 1.9 1 2.6-.4.6-.6 1.3-.6 2A3.8 3.8 0 0 0 9.7 19.5c.5.9 1.4 1.5 2.3 1.5" />
        <path d="M12 4a3.5 3.5 0 0 1 3.5 3.5c1.8.3 3 1.8 3 3.6 0 1-.4 1.9-1 2.6.4.6.6 1.3.6 2A3.8 3.8 0 0 1 14.3 19.5c-.5.9-1.4 1.5-2.3 1.5" />
        <path d="M12 4v17" />
        <circle cx="8.5" cy="11" r="1" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="13.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === "km") {
    // connected nodes / graph
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="2.4" />
        <circle cx="18" cy="8" r="2.4" />
        <circle cx="8" cy="18" r="2.4" />
        <circle cx="17.5" cy="17" r="2.4" />
        <path d="M8.2 7l7.4 1M7 8.2 8 15.6M10.3 17.4l4.8-.2M16.9 10.3l.4 4.3" />
      </svg>
    );
  }
  // cm: transformation arrows
  return (
    <svg {...common}>
      <path d="M4 9a8 8 0 0 1 14-2.5" />
      <path d="M18 3v4h-4" />
      <path d="M20 15a8 8 0 0 1-14 2.5" />
      <path d="M6 21v-4h4" />
    </svg>
  );
}

/** Small glyph for each AI Classroom category, used in the front-page
 * index grid. Keep in sync with the classroom_category enum. */
export function CategoryGlyph({ category }: { category: ClassroomCategory }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-5 w-5",
    "aria-hidden": true,
  };

  switch (category) {
    case "knowledge": // open book
      return (
        <svg {...common}>
          <path d="M12 6c-1.5-1.3-3.7-2-6-2v14c2.3 0 4.5.7 6 2 1.5-1.3 3.7-2 6-2V4c-2.3 0-4.5.7-6 2Z" />
          <path d="M12 6v14" />
        </svg>
      );
    case "skill": // lightning
      return (
        <svg {...common}>
          <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" />
        </svg>
      );
    case "mcp": // plug
      return (
        <svg {...common}>
          <path d="M9 2v6M15 2v6" />
          <path d="M6 8h12v3a6 6 0 0 1-4.5 5.8V22h-3v-5.2A6 6 0 0 1 6 11V8Z" />
        </svg>
      );
    case "api": // code braces
      return (
        <svg {...common}>
          <path d="M8 4C6 4 6 6 6 7.5S6 11 4 12c2 1 2 3 2 4.5S6 20 8 20" />
          <path d="M16 4c2 0 2 2 2 3.5s0 3.5 2 4.5c-2 1-2 3-2 4.5s0 3.5-2 3.5" />
        </svg>
      );
    case "best-practices": // shield check
      return (
        <svg {...common}>
          <path d="M12 2 4.5 5v6c0 5 3.2 8.7 7.5 11 4.3-2.3 7.5-6 7.5-11V5L12 2Z" />
          <path d="m8.8 11.8 2.2 2.2 4.2-4.5" />
        </svg>
      );
    case "use-cases": // briefcase
      return (
        <svg {...common}>
          <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
          <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17" />
        </svg>
      );
    case "step-by-step": // stairs / ordered steps
      return (
        <svg {...common}>
          <path d="M4 20h4v-4h4v-4h4V8h4" />
          <circle cx="5.5" cy="16.5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "ai-evaluation": // gauge
      return (
        <svg {...common}>
          <path d="M4 14a8 8 0 1 1 16 0" />
          <path d="m12 14 4-4.5" />
          <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />
          <path d="M3 18h18" />
        </svg>
      );
    case "ai-models": // cpu chip
      return (
        <svg {...common}>
          <rect x="6" y="6" width="12" height="12" rx="2" />
          <rect x="10" y="10" width="4" height="4" />
          <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
        </svg>
      );
    case "ai":
    default: // sparkles
      return (
        <svg {...common}>
          <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z" />
          <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" />
        </svg>
      );
  }
}
