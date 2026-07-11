// A small hand-rolled Fruchterman-Reingold force layout — no d3-force
// dependency needed for a personal-scale graph (tens to low hundreds of
// notes). Runs once (not animated) and returns settled positions.

export interface LayoutNode {
  id: number;
}
export interface LayoutEdge {
  from: number;
  to: number;
}
export interface PositionedNode {
  id: number;
  x: number;
  y: number;
}

export function computeForceLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  width: number,
  height: number,
  iterations = 250,
): Map<number, { x: number; y: number }> {
  const n = nodes.length;
  const positions = new Map<number, { x: number; y: number }>();
  if (n === 0) return positions;

  nodes.forEach((node, i) => {
    const angle = (i / n) * Math.PI * 2;
    const radius = Math.min(width, height) * 0.3;
    positions.set(node.id, {
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
    });
  });

  const k = Math.sqrt((width * height) / Math.max(n, 1));
  let temperature = width / 10;

  for (let iter = 0; iter < iterations; iter++) {
    const disp = new Map<number, { x: number; y: number }>();
    nodes.forEach((node) => disp.set(node.id, { x: 0, y: 0 }));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const pa = positions.get(a.id)!;
        const pb = positions.get(b.id)!;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (k * k) / dist;
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        const da = disp.get(a.id)!;
        da.x += dx;
        da.y += dy;
        const dbn = disp.get(b.id)!;
        dbn.x -= dx;
        dbn.y -= dy;
      }
    }

    for (const e of edges) {
      const pa = positions.get(e.from);
      const pb = positions.get(e.to);
      if (!pa || !pb) continue;
      let dx = pa.x - pb.x;
      let dy = pa.y - pb.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist * dist) / k;
      dx = (dx / dist) * force;
      dy = (dy / dist) * force;
      const da = disp.get(e.from)!;
      da.x -= dx;
      da.y -= dy;
      const dbn = disp.get(e.to)!;
      dbn.x += dx;
      dbn.y += dy;
    }

    nodes.forEach((node) => {
      const d = disp.get(node.id)!;
      const dist = Math.sqrt(d.x * d.x + d.y * d.y) || 0.01;
      const limited = Math.min(dist, temperature);
      const p = positions.get(node.id)!;
      p.x += (d.x / dist) * limited;
      p.y += (d.y / dist) * limited;
      p.x = Math.min(width - 30, Math.max(30, p.x));
      p.y = Math.min(height - 30, Math.max(30, p.y));
    });

    temperature *= 0.97;
  }

  return positions;
}
