"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { ATOM_KIND_COLORS } from "@/lib/knowledge/taxonomy";

export interface ConstellationAtom {
  id: number;
  kind: string;
  statement: string;
  confidence: number;
  salience: number;
  reinforcementCount: number;
  pinned: boolean;
}

export interface ConstellationLink {
  id: number;
  from: number;
  to: number;
  linkType: string;
  resolved: boolean;
}

interface Body {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  atom: ConstellationAtom;
  /** 0-1 pulse envelope, kicked to 1 on hover/select and decaying — what
   *  makes the graph feel alive rather than a static diagram. */
  pulse: number;
  twinkle: number;
}

/**
 * A living map of the knowledge base.
 *
 * This is a continuously-simulated force graph on canvas rather than the
 * settled one-shot SVG layout used by /graph — the difference is the
 * point: knowledge is something that's still moving and growing, and the
 * drifting, breathing motion communicates that in a way a static picture
 * can't. Node radius encodes how well-established a belief is
 * (reinforcement count), opacity encodes salience (how live it is), color
 * encodes kind, and contradiction links are drawn in an angry dashed red
 * so unresolved tension is visible at a glance.
 *
 * Hand-rolled Verlet-ish integration on canvas — no new dependency, and it
 * comfortably handles the few hundred nodes a personal knowledge base
 * reaches. Respects prefers-reduced-motion by settling and freezing.
 */
export function KnowledgeConstellation({
  atoms,
  links,
  onSelect,
  selectedId,
  height = 560,
}: {
  atoms: ConstellationAtom[];
  links: ConstellationLink[];
  onSelect?: (atom: ConstellationAtom | null) => void;
  selectedId?: number | null;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodiesRef = useRef<Body[]>([]);
  const frameRef = useRef<number>(0);
  const draggingRef = useRef<Body | null>(null);
  const [hovered, setHovered] = useState<ConstellationAtom | null>(null);
  const [kindFilter, setKindFilter] = useState<string | null>(null);

  // Focus state is mirrored into refs so the render loop can read the
  // CURRENT value without being a dependency of the effect that owns it.
  // Without this, every mousemove would tear down and restart the whole
  // requestAnimationFrame loop — which visibly stutters the simulation.
  const hoveredRef = useRef<ConstellationAtom | null>(null);
  const selectedRef = useRef<number | null>(null);
  hoveredRef.current = hovered;
  selectedRef.current = selectedId ?? null;

  const kinds = useMemo(
    () => Array.from(new Set(atoms.map((a) => a.kind))).sort(),
    [atoms],
  );

  const visible = useMemo(
    () => (kindFilter ? atoms.filter((a) => a.kind === kindFilter) : atoms),
    [atoms, kindFilter],
  );

  const visibleIds = useMemo(() => new Set(visible.map((a) => a.id)), [visible]);
  const visibleLinks = useMemo(
    () => links.filter((l) => visibleIds.has(l.from) && visibleIds.has(l.to)),
    [links, visibleIds],
  );

  // Rebuild bodies when the visible set changes, preserving positions of
  // nodes that survive so filtering doesn't reshuffle the whole map.
  useEffect(() => {
    const prev = new Map(bodiesRef.current.map((b) => [b.id, b]));
    const w = wrapRef.current?.clientWidth ?? 800;

    bodiesRef.current = visible.map((atom, i) => {
      const existing = prev.get(atom.id);
      const angle = (i / Math.max(visible.length, 1)) * Math.PI * 2;
      const radius = Math.min(w, height) * 0.32;
      return {
        id: atom.id,
        x: existing?.x ?? w / 2 + Math.cos(angle) * radius * (0.6 + Math.random() * 0.6),
        y: existing?.y ?? height / 2 + Math.sin(angle) * radius * (0.6 + Math.random() * 0.6),
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
        // Well-corroborated beliefs are literally bigger. Log-ish scaling
        // so a 20x-reinforced atom doesn't dwarf everything else.
        r: 5 + Math.min(Math.sqrt(atom.reinforcementCount) * 3.2, 16) + (atom.pinned ? 2 : 0),
        color: ATOM_KIND_COLORS[atom.kind] ?? "#64748b",
        atom,
        pulse: existing?.pulse ?? 0,
        twinkle: Math.random() * Math.PI * 2,
      };
    });
  }, [visible, height]);

  const pick = useCallback((x: number, y: number): Body | null => {
    // Reverse order so the topmost drawn node wins a click.
    for (let i = bodiesRef.current.length - 1; i >= 0; i--) {
      const b = bodiesRef.current[i];
      const dx = b.x - x;
      const dy = b.y - y;
      if (dx * dx + dy * dy <= (b.r + 6) * (b.r + 6)) return b;
    }
    return null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = wrap.clientWidth;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let settleFrames = 0;

    function resize() {
      if (!wrap || !canvas || !ctx) return;
      width = wrap.clientWidth;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    const linkIndex = new Map<number, number[]>();
    for (const l of visibleLinks) {
      if (!linkIndex.has(l.from)) linkIndex.set(l.from, []);
      if (!linkIndex.has(l.to)) linkIndex.set(l.to, []);
      linkIndex.get(l.from)!.push(l.to);
      linkIndex.get(l.to)!.push(l.from);
    }

    function step() {
      const bodies = bodiesRef.current;
      const n = bodies.length;
      if (n === 0) return;

      const centerX = width / 2;
      const centerY = height / 2;

      // Repulsion — O(n²) but n is a few hundred at most here, and the
      // clarity is worth more than a quadtree at this scale.
      for (let i = 0; i < n; i++) {
        const a = bodies[i];
        for (let j = i + 1; j < n; j++) {
          const b = bodies[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            d2 = 0.01;
          }
          const d = Math.sqrt(d2);
          const minDist = a.r + b.r + 14;
          const force = (2600 / d2) * (d < minDist ? 3 : 1);
          const fx = (dx / d) * force;
          const fy = (dy / d) * force;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
        // Gentle pull to center keeps the graph on screen without a hard
        // clamp (which would pile nodes along the edges).
        a.vx += (centerX - a.x) * 0.0016;
        a.vy += (centerY - a.y) * 0.0016;
      }

      const byId = new Map(bodies.map((b) => [b.id, b]));
      for (const link of visibleLinks) {
        const a = byId.get(link.from);
        const b = byId.get(link.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        // Contradictions sit further apart than supports — the layout
        // itself should show tension, not just the line color.
        const rest = link.linkType === "contradicts" ? 190 : 110;
        const k = link.linkType === "contradicts" ? 0.0016 : 0.0042;
        const force = (d - rest) * k;
        a.vx += (dx / d) * force;
        a.vy += (dy / d) * force;
        b.vx -= (dx / d) * force;
        b.vy -= (dy / d) * force;
      }

      const damping = reduceMotion ? 0.6 : 0.86;
      for (const b of bodies) {
        if (draggingRef.current === b) continue;
        b.vx *= damping;
        b.vy *= damping;
        const speed = Math.hypot(b.vx, b.vy);
        const maxSpeed = 4;
        if (speed > maxSpeed) {
          b.vx = (b.vx / speed) * maxSpeed;
          b.vy = (b.vy / speed) * maxSpeed;
        }
        b.x += b.vx;
        b.y += b.vy;
        b.x = Math.max(b.r + 4, Math.min(width - b.r - 4, b.x));
        b.y = Math.max(b.r + 4, Math.min(height - b.r - 4, b.y));
        b.pulse *= 0.94;
        b.twinkle += 0.02;
      }
    }

    function draw() {
      if (!ctx) return;
      const bodies = bodiesRef.current;
      ctx.clearRect(0, 0, width, height);

      const byId = new Map(bodies.map((b) => [b.id, b]));
      const activeId = selectedRef.current ?? hoveredRef.current?.id ?? null;
      const neighbors = activeId ? new Set(linkIndex.get(activeId) ?? []) : null;

      // Links first so nodes draw on top.
      for (const link of visibleLinks) {
        const a = byId.get(link.from);
        const b = byId.get(link.to);
        if (!a || !b) continue;

        const related = activeId === null || link.from === activeId || link.to === activeId;
        const contradiction = link.linkType === "contradicts" && !link.resolved;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        // A slight curve reads much better than straight lines once the
        // graph is dense.
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const nx = -(b.y - a.y) * 0.08;
        const ny = (b.x - a.x) * 0.08;
        ctx.quadraticCurveTo(mx + nx, my + ny, b.x, b.y);

        if (contradiction) {
          ctx.strokeStyle = related ? "rgba(239,68,68,0.85)" : "rgba(239,68,68,0.22)";
          ctx.setLineDash([5, 4]);
          ctx.lineWidth = related ? 2 : 1.2;
        } else {
          const alpha = related ? 0.4 : 0.1;
          ctx.strokeStyle =
            link.linkType === "refines"
              ? `rgba(6,182,212,${alpha})`
              : `rgba(148,163,184,${alpha})`;
          ctx.lineWidth = related ? 1.6 : 1;
        }
        ctx.stroke();
        ctx.restore();
      }

      for (const b of bodies) {
        const isActive = activeId === b.id;
        const isNeighbor = neighbors?.has(b.id) ?? false;
        const dimmed = activeId !== null && !isActive && !isNeighbor;

        // Salience drives opacity — quiet knowledge literally fades.
        const baseAlpha = 0.35 + b.atom.salience * 0.65;
        const alpha = dimmed ? baseAlpha * 0.22 : baseAlpha;
        const breathe = 1 + Math.sin(b.twinkle) * 0.03;
        const radius = b.r * breathe * (1 + b.pulse * 0.35);

        ctx.save();
        ctx.globalAlpha = alpha;

        // Glow scales with confidence so strongly-held beliefs shine.
        const glow = ctx.createRadialGradient(b.x, b.y, radius * 0.3, b.x, b.y, radius * 2.6);
        glow.addColorStop(0, `${b.color}${isActive ? "cc" : "66"}`);
        glow.addColorStop(1, `${b.color}00`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(b.x, b.y, radius * 2.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.globalAlpha = alpha;
        ctx.fill();

        if (b.atom.pinned) {
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        if (isActive) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, radius + 5, 0, Math.PI * 2);
          ctx.strokeStyle = b.color;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.9;
          ctx.stroke();
        }
        ctx.restore();

        // Label only the significant nodes, or whatever's focused —
        // labeling everything turns the map into unreadable soup.
        const labelWorthy = b.r > 10 || isActive || isNeighbor;
        if (labelWorthy && !dimmed) {
          ctx.save();
          ctx.globalAlpha = isActive ? 1 : 0.75;
          ctx.font = `${isActive ? "600 " : ""}11px ui-sans-serif, system-ui, sans-serif`;
          ctx.fillStyle = "rgba(148,163,184,0.95)";
          ctx.textAlign = "center";
          const label =
            b.atom.statement.length > 34
              ? `${b.atom.statement.slice(0, 32)}…`
              : b.atom.statement;
          ctx.fillText(label, b.x, b.y + radius + 13);
          ctx.restore();
        }
      }
    }

    function loop() {
      // Once a reduced-motion layout has settled, stop integrating (but
      // keep the canvas painted) so there's no perpetual animation.
      if (!reduceMotion || settleFrames < 220) {
        step();
        settleFrames++;
      }
      draw();
      frameRef.current = requestAnimationFrame(loop);
    }
    loop();

    return () => {
      cancelAnimationFrame(frameRef.current);
      observer.disconnect();
    };
    // Deliberately NOT depending on hovered/selectedId — those are read
    // through refs inside draw() so highlighting doesn't restart the loop.
  }, [visibleLinks, height]);

  function canvasCoords(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setKindFilter(null)}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
            kindFilter === null
              ? "border-accent bg-accent text-accent-fg"
              : "border-border text-fg-secondary hover:border-accent hover:text-accent"
          }`}
        >
          all
        </button>
        {kinds.map((kind) => {
          const active = kindFilter === kind;
          const color = ATOM_KIND_COLORS[kind] ?? "#64748b";
          return (
            <button
              key={kind}
              type="button"
              onClick={() => setKindFilter(active ? null : kind)}
              style={
                active
                  ? { backgroundColor: color, borderColor: color }
                  : { borderColor: `${color}66`, color }
              }
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                active ? "text-white" : "hover:opacity-80"
              }`}
            >
              {kind}
            </button>
          );
        })}
        <span className="ml-auto text-xs text-fg-secondary">
          {visible.length} atoms · {visibleLinks.length} links
        </span>
      </div>

      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-bg-elevated via-bg to-bg-elevated"
      >
        <canvas
          ref={canvasRef}
          className="block cursor-grab active:cursor-grabbing"
          onMouseMove={(e) => {
            const { x, y } = canvasCoords(e);
            if (draggingRef.current) {
              draggingRef.current.x = x;
              draggingRef.current.y = y;
              draggingRef.current.vx = 0;
              draggingRef.current.vy = 0;
              return;
            }
            const hit = pick(x, y);
            if (hit) hit.pulse = 1;
            setHovered(hit?.atom ?? null);
          }}
          onMouseDown={(e) => {
            const { x, y } = canvasCoords(e);
            const hit = pick(x, y);
            if (hit) {
              draggingRef.current = hit;
              hit.pulse = 1;
            }
          }}
          onMouseUp={(e) => {
            const wasDragging = draggingRef.current;
            draggingRef.current = null;
            const { x, y } = canvasCoords(e);
            const hit = pick(x, y);
            if (hit && hit === wasDragging) onSelect?.(hit.atom);
            else if (!hit) onSelect?.(null);
          }}
          onMouseLeave={() => {
            draggingRef.current = null;
            setHovered(null);
          }}
        />

        {hovered && (
          <div className="pointer-events-none absolute left-3 top-3 max-w-sm rounded-lg border border-border bg-bg-elevated/95 px-3 py-2 shadow-lg backdrop-blur">
            <p className="text-sm text-fg">{hovered.statement}</p>
            <p className="mt-1 flex items-center gap-2 text-xs text-fg-secondary">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: ATOM_KIND_COLORS[hovered.kind] ?? "#64748b" }}
              />
              {hovered.kind} · seen {hovered.reinforcementCount}× · confidence{" "}
              {Math.round(hovered.confidence * 100)}%
              {hovered.pinned && " · 📌"}
            </p>
          </div>
        )}

        {visible.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-fg-secondary">
            Nothing here yet — write a diary entry and the map will start growing.
          </div>
        )}
      </div>
    </div>
  );
}
