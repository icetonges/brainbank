"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { computeForceLayout } from "@/lib/notes/force-layout";

export interface GraphNode {
  id: number;
  slug: string;
  title: string;
}
export interface GraphEdge {
  from: number;
  to: number;
}

const WIDTH = 900;
const HEIGHT = 560;

export function GraphView({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const router = useRouter();
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  // nodes/edges are refetched server-side per navigation, so array/object
  // identity changes on every load — key the memo off a content fingerprint
  // instead so the layout only recomputes when the graph actually changes.
  const nodesKey = nodes.map((n) => n.id).join(",");
  const edgesKey = edges.map((e) => `${e.from}-${e.to}`).join(",");
  const positions = useMemo(
    () => computeForceLayout(nodes, edges, WIDTH, HEIGHT),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodesKey, edgesKey],
  );

  const connected = useMemo(() => {
    if (hoveredId === null) return null;
    const ids = new Set<number>([hoveredId]);
    for (const e of edges) {
      if (e.from === hoveredId) ids.add(e.to);
      if (e.to === hoveredId) ids.add(e.from);
    }
    return ids;
  }, [hoveredId, edges]);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-full w-full rounded-lg border border-border bg-bg-elevated"
      role="img"
      aria-label="Note connection graph"
    >
      <title>Note connection graph</title>
      <g>
        {edges.map((e, i) => {
          const from = positions.get(e.from);
          const to = positions.get(e.to);
          if (!from || !to) return null;
          const dimmed = connected ? !(connected.has(e.from) && connected.has(e.to)) : false;
          return (
            <line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="var(--color-border)"
              strokeWidth={dimmed ? 1 : 1.5}
              opacity={dimmed ? 0.25 : 0.8}
            />
          );
        })}
      </g>
      <g>
        {nodes.map((node) => {
          const p = positions.get(node.id);
          if (!p) return null;
          const isHovered = hoveredId === node.id;
          const dimmed = connected ? !connected.has(node.id) : false;
          // Labels drawn to the right get clipped by the SVG viewBox for
          // any node in the right third of the canvas (and force-layout
          // only keeps the node's own point in bounds, not its label's
          // text extent) — flip the label to the left of the node there
          // instead of letting it run off the edge.
          const flipLeft = p.x > WIDTH * 0.7;
          return (
            <g
              key={node.id}
              transform={`translate(${p.x}, ${p.y})`}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => router.push(`/notes/${node.slug}`)}
              className="cursor-pointer"
              opacity={dimmed ? 0.35 : 1}
            >
              <circle
                r={isHovered ? 9 : 6}
                fill={isHovered ? "var(--color-accent)" : "var(--color-fg)"}
                stroke="var(--color-bg-elevated)"
                strokeWidth={2}
              />
              <text
                x={flipLeft ? -12 : 12}
                y={4}
                textAnchor={flipLeft ? "end" : "start"}
                fontSize={12}
                fill={isHovered ? "var(--color-accent)" : "var(--color-fg-secondary)"}
                className="select-none"
              >
                {node.title.length > 28 ? `${node.title.slice(0, 28)}…` : node.title}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
