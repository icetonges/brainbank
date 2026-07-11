import { db, isDatabaseConfigured } from "@/lib/db";
import { notes, edges as edgesTable } from "@/lib/db/schema";
import { GraphView } from "@/components/graph-view";

export const dynamic = "force-dynamic";

async function loadGraph() {
  if (!isDatabaseConfigured) return { nodes: [], edges: [], error: "not-configured" as const };
  try {
    const noteRows = await db.select({ id: notes.id, slug: notes.slug, title: notes.title }).from(notes);
    const edgeRows = await db
      .select({ from: edgesTable.fromNoteId, to: edgesTable.toNoteId })
      .from(edgesTable);
    return { nodes: noteRows, edges: edgeRows, error: null };
  } catch {
    return { nodes: [], edges: [], error: "connection-failed" as const };
  }
}

export default async function GraphPage() {
  const { nodes, edges, error } = await loadGraph();

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-fg-secondary">
        <p className="font-medium text-fg">
          {error === "not-configured" ? "Database not connected yet." : "Couldn't reach the database."}
        </p>
        <p className="text-sm">See SETUP.md.</p>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <h1 className="text-2xl font-semibold text-fg">Interactive graph</h1>
        <p className="max-w-md text-fg-secondary">
          No notes yet. Create a couple and link them with{" "}
          <code className="text-accent">[[Wikilinks]]</code> to see the graph
          take shape.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-fg">Your knowledge graph</h1>
        <p className="mt-1 text-sm text-fg-secondary">
          {nodes.length} note{nodes.length === 1 ? "" : "s"} · {edges.length} link
          {edges.length === 1 ? "" : "s"}. Hover to trace connections, click to open.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <GraphView nodes={nodes} edges={edges} />
      </div>
    </div>
  );
}
