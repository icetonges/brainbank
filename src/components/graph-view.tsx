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
  const [query, setQuery] = useState("");

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

  // Connection count per node — sizes the circle so a well-connected hub
  // note reads as more important than an isolated one at a glance, instead
  // of every node looking the same regardless of how it fits in.
  const degree = useMemo(() => {
    const d = new Map<number, number>();
    for (const n of nodes) d.set(n.id, 0);
    for (const e of edges) {
      d.set(e.from, (d.get(e.from) ?? 0) + 1);
      d.set(e.to, (d.get(e.to) ?? 0) + 1);
    }
    return d;
  }, [nodes, edges]);
  const maxDegree = Math.max(1, ...degree.values());

  const trimmedQuery = query.trim().toLowerCase();
  const matchIds = useMemo(() => {
    if (!trimmedQuery) return null;
    return new Set(
      nodes.filter((n) => n.title.toLowerCase().includes(trimmedQuery)).map((n) => n.id),
    );
  }, [nodes, trimmedQuery]);

  // The "focused" set drives both which labels show and which edges
  // render at full strength. Hovering a node focuses it + its direct
  // neighbors; with nothing hovered, a search instead focuses every
  // title match. With no hover and no search, nothing is focused —
  // every other force-graph tool (Obsidian included) hides labels by
  // default past a handful of nodes, because labeling all of them at
  // once is unreadable (which is exactly what this graph looked like
  // before: 52 nodes' worth of overlapping text over a 500-edge tangle).
  const focusIds = useMemo(() => {
    if (hoveredId !== null) {
      const ids = new Set<number>([hoveredId]);
      for (const e of edges) {
        if (e.from === hoveredId) ids.add(e.to);
        if (e.to === hoveredId) ids.add(e.from);
      }
      return ids;
    }
    return matchIds;
  }, [hoveredId, edges, matchIds]);

  return (
    <div className="flex h-full flex-col gap-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a note by title…"
        className="w-full max-w-sm rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
      />
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-full w-full flex-1 rounded-lg border border-border bg-bg-elevated"
        role="img"
        aria-label="Note connection graph"
      >
        <title>Note connection graph</title>
        <g>
          {edges.map((e, i) => {
            const from = positions.get(e.from);
            const to = positions.get(e.to);
            if (!from || !to) return null;
            const touchesFocus = focusIds ? focusIds.has(e.from) || focusIds.has(e.to) : false;
            // With something focused, only edges touching it render at
            // all — otherwise every edge stays in at a faint opacity, just
            // enough to suggest overall density without drowning out the
            // nodes themselves.
            if (focusIds && !touchesFocus) return null;
            return (
              <line
                key={i}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="var(--color-border)"
                strokeWidth={focusIds ? 1.5 : 1}
                opacity={focusIds ? 0.85 : 0.2}
              />
            );
          })}
        </g>
        <g>
          {nodes.map((node) => {
            const p = positions.get(node.id);
            if (!p) return null;
            const isHovered = hoveredId === node.id;
            const isMatch = matchIds?.has(node.id) ?? false;
            const inFocus = focusIds ? focusIds.has(node.id) : true;
            const showLabel = focusIds ? focusIds.has(node.id) : false;
            const baseSize = 4 + ((degree.get(node.id) ?? 0) / maxDegree) * 6;
            // Labels drawn to the right get clipped by the SVG viewBox for
            // any node in the right third of the canvas — flip the label
            // to the left of the node there instead of letting it run off
            // the edge.
            const flipLeft = p.x > WIDTH * 0.7;
            return (
              <g
                key={node.id}
                transform={`translate(${p.x}, ${p.y})`}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => router.push(`/notes/${node.slug}`)}
                className="cursor-pointer"
                opacity={inFocus ? 1 : 0.15}
              >
                <circle
                  r={isHovered ? baseSize + 3 : baseSize}
                  fill={isHovered || isMatch ? "var(--color-accent)" : "var(--color-fg)"}
                  stroke="var(--color-bg-elevated)"
                  strokeWidth={2}
                />
                {showLabel && (
                  <text
                    x={flipLeft ? -12 : 12}
                    y={4}
                    textAnchor={flipLeft ? "end" : "start"}
                    fontSize={12}
                    fill={isHovered || isMatch ? "var(--color-accent)" : "var(--color-fg-secondary)"}
                    className="select-none"
                  >
                    {node.title.length > 28 ? `${node.title.slice(0, 28)}…` : node.title}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
