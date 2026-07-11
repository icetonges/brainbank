import { db } from "@/lib/db";
import { notes, edges } from "@/lib/db/schema";
import { extractWikilinkTitles } from "@/lib/wikilinks";
import { eq, and } from "drizzle-orm";

/**
 * Scans the given text blocks for [[Wikilinks]], resolves each to an
 * existing note by title (case-insensitive), and records an edge for every
 * match. This is what makes the graph (PLAN.md §7) grow just from writing
 * notes the way you would in Obsidian — no separate "link notes" UI step.
 * Unmatched titles (no note with that title yet) are silently skipped; a
 * later pass could turn those into "create note" prompts.
 */
export async function linkWikilinksFromText(
  fromNoteId: number,
  ...blocks: (string | null | undefined)[]
): Promise<number> {
  const titles = extractWikilinkTitles(...blocks);
  if (titles.length === 0) return 0;

  const allNotes = await db
    .select({ id: notes.id, title: notes.title })
    .from(notes);

  const byLowerTitle = new Map(allNotes.map((n) => [n.title.toLowerCase(), n.id]));

  let created = 0;
  for (const title of titles) {
    const toNoteId = byLowerTitle.get(title.toLowerCase());
    if (!toNoteId || toNoteId === fromNoteId) continue;

    const existing = await db.query.edges.findFirst({
      where: and(eq(edges.fromNoteId, fromNoteId), eq(edges.toNoteId, toNoteId)),
    });
    if (existing) continue;

    await db.insert(edges).values({
      fromNoteId,
      toNoteId,
      relationshipType: "link",
    });
    created += 1;
  }

  return created;
}
