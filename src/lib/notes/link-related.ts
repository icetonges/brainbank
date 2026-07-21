import { db } from "@/lib/db";
import { noteTags, edges } from "@/lib/db/schema";
import { eq, and, or, ne, inArray, sql } from "drizzle-orm";

/**
 * Code-only "find related notes" step (PLAN.md §5 step 4: "suggest links
 * to existing notes — keyword match first"). This was never actually
 * implemented — [[wikilinks]] only get turned into edges when someone
 * types that exact syntax, which the AI drafting step never does and an
 * Obsidian-synced freeform note usually doesn't either. Without this, the
 * graph shows every AI-drafted or synced note with zero connections no
 * matter how many notes exist, which is what it was doing in production.
 *
 * Connects a note to every other note it shares a *distinctive* tag with,
 * as a "related" edge, so the graph reflects real relationships without
 * requiring anyone to hand-link notes. Call this after a note's tags are
 * set (drafting, tag suggestion, or Obsidian sync all assign tags).
 */

/** A tag carried by more than this share of all tagged notes has no
 * discriminating power — in an AI-focused vault nearly everything ends up
 * tagged "ai" or "claude-code", so treating any shared tag as "these two
 * notes are related" turns the graph into a near-complete hairball (52
 * notes, 500 edges in production). Only tags at or under the threshold
 * count toward relatedness. MIN_GENERIC_TAG_NOTES keeps the threshold
 * from being absurdly strict while the vault is still small (in a
 * 10-note vault, 20% is 2 notes, which would disqualify almost every
 * tag). */
const GENERIC_TAG_SHARE = 0.2;
const MIN_GENERIC_TAG_NOTES = 4;

/** Of `candidateTagIds`, the subset that are specific enough (used by few
 * enough notes) to count as a relatedness signal. */
async function specificTagIds(candidateTagIds: number[]): Promise<Set<number>> {
  if (candidateTagIds.length === 0) return new Set();

  const [totalRow] = await db
    .select({ total: sql<number>`count(distinct ${noteTags.noteId})` })
    .from(noteTags);
  const threshold = Math.max(
    MIN_GENERIC_TAG_NOTES,
    Math.round(Number(totalRow?.total ?? 0) * GENERIC_TAG_SHARE),
  );

  const counts = await db
    .select({
      tagId: noteTags.tagId,
      notesWithTag: sql<number>`count(distinct ${noteTags.noteId})`,
    })
    .from(noteTags)
    .where(inArray(noteTags.tagId, candidateTagIds))
    .groupBy(noteTags.tagId);

  return new Set(
    counts.filter((c) => Number(c.notesWithTag) <= threshold).map((c) => c.tagId),
  );
}

export async function linkRelatedByTags(noteId: number): Promise<number> {
  const myTagRows = await db
    .select({ tagId: noteTags.tagId })
    .from(noteTags)
    .where(eq(noteTags.noteId, noteId));
  const myTagIds = myTagRows.map((r) => r.tagId);
  if (myTagIds.length === 0) return 0;

  const specific = [...(await specificTagIds(myTagIds))];
  // Every one of this note's tags is too generic to signal relatedness on
  // its own — no edges rather than falling back to the noisy old rule.
  if (specific.length === 0) return 0;

  const relatedRows = await db
    .select({ noteId: noteTags.noteId })
    .from(noteTags)
    .where(and(inArray(noteTags.tagId, specific), ne(noteTags.noteId, noteId)));

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

/**
 * Re-derives every auto "related" edge under the current (specific-tag)
 * rule above. Needed as a one-time cleanup after tightening the rule:
 * linkRelatedByTags() only runs when a note's tags are (re)set, so without
 * this, edges created under the old "any shared tag" rule stick around
 * forever even though they'd never be created today. Real [[wikilink]]
 * edges (relationshipType "link") are untouched — only "related" rows are
 * deleted and rebuilt.
 */
export async function rebuildRelatedEdges(): Promise<{
  notesProcessed: number;
  edgesCreated: number;
}> {
  await db.delete(edges).where(eq(edges.relationshipType, "related"));

  const taggedNotes = await db
    .selectDistinct({ noteId: noteTags.noteId })
    .from(noteTags);

  let edgesCreated = 0;
  for (const { noteId } of taggedNotes) {
    edgesCreated += await linkRelatedByTags(noteId);
  }
  return { notesProcessed: taggedNotes.length, edgesCreated };
}
