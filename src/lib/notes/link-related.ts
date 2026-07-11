import { db } from "@/lib/db";
import { noteTags, edges } from "@/lib/db/schema";
import { eq, and, or, ne, inArray } from "drizzle-orm";

/**
 * Code-only "find related notes" step (PLAN.md §5 step 4: "suggest links
 * to existing notes — keyword match first"). This was never actually
 * implemented — [[wikilinks]] only get turned into edges when someone
 * types that exact syntax, which the AI drafting step never does and an
 * Obsidian-synced freeform note usually doesn't either. Without this, the
 * graph shows every AI-drafted or synced note with zero connections no
 * matter how many notes exist, which is what it was doing in production.
 *
 * Connects a note to every other note it shares at least one tag with, as
 * a "related" edge, so the graph reflects real relationships without
 * requiring anyone to hand-link notes. Call this after a note's tags are
 * set (drafting, tag suggestion, or Obsidian sync all assign tags).
 */
export async function linkRelatedByTags(noteId: number): Promise<number> {
  const myTagRows = await db
    .select({ tagId: noteTags.tagId })
    .from(noteTags)
    .where(eq(noteTags.noteId, noteId));
  const myTagIds = myTagRows.map((r) => r.tagId);
  if (myTagIds.length === 0) return 0;

  const relatedRows = await db
    .select({ noteId: noteTags.noteId })
    .from(noteTags)
    .where(and(inArray(noteTags.tagId, myTagIds), ne(noteTags.noteId, noteId)));

  const relatedNoteIds = [...new Set(relatedRows.map((r) => r.noteId))];
  let created = 0;

  for (const otherId of relatedNoteIds) {
    const existing = await db.query.edges.findFirst({
      where: or(
        and(eq(edges.fromNoteId, noteId), eq(edges.toNoteId, otherId)),
        and(eq(edges.fromNoteId, otherId), eq(edges.toNoteId, noteId)),
      ),
    });
    if (existing) continue;

    await db.insert(edges).values({
      fromNoteId: noteId,
      toNoteId: otherId,
      relationshipType: "related",
    });
    created += 1;
  }

  return created;
}
