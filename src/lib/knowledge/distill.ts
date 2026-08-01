import { db } from "@/lib/db";
import {
  notes,
  noteContent,
  diaryEntries,
  knowledgeAtoms,
  knowledgeAtomSources,
  knowledgeLinks,
  knowledgeRuns,
} from "@/lib/db/schema";
import type { AtomKind, AtomLinkType } from "@/lib/db/schema";
import { and, eq, lt, sql, isNull, desc, ne } from "drizzle-orm";
import { extractKnowledgeAtoms, reconcileAtom, type AtomCandidate } from "@/lib/ai/tasks";
import { embedTextsOrNull } from "@/lib/ai/embeddings";
import { findCandidates } from "./similarity";

// --- THE DISTILLATION PIPELINE ---
//
// One diary entry in, an updated knowledge base out. The steps below are
// what make this a knowledge base that gets SMARTER rather than merely
// BIGGER — see the long design note on the knowledge tables in schema.ts.
//
//   entry -> extract candidates (local-only LLM)
//         -> embed each candidate
//         -> for each: find similar existing atoms
//              same        -> reinforce (confidence up, evidence appended)
//              contradicts -> create atom + an unresolved contradiction link
//              refines     -> create atom + a "refines" link
//              distinct    -> create atom
//         -> mark entry distilled
//
// Everything is idempotent-ish: re-distilling an entry reinforces what it
// already produced rather than duplicating it, so the "re-distill" button
// is always safe to press.

/** Confidence gained per independent reinforcement, with diminishing
 *  returns — the 5th sighting should move the needle far less than the
 *  2nd. Asymptotes toward 1.0 and never reaches it: this system should
 *  never be *certain* about a person. */
function reinforcedConfidence(current: number, evidence: number): number {
  const gap = 1 - current;
  return Math.min(0.98, current + gap * 0.35 * Math.max(0.2, evidence));
}

/** Salience resets to near-full on every reinforcement — recency of
 *  mention is the signal, and decayAtoms() below is what erodes it again. */
const REINFORCED_SALIENCE = 0.9;

/** Atoms untouched for this long start decaying. ~10 weeks: long enough
 *  that a seasonal-but-real interest doesn't get flagged, short enough
 *  that genuinely dead threads surface within a quarter. */
const DECAY_AFTER_DAYS = 70;

export interface DistillResult {
  runId: number;
  atomsCreated: number;
  atomsReinforced: number;
  linksCreated: number;
  skipped?: string;
}

async function startRun(noteId: number, kind: "distill" | "synthesize" | "decay") {
  const [run] = await db
    .insert(knowledgeRuns)
    .values({ kind, noteId, status: "running", startedAt: new Date() })
    .returning();
  return run;
}

async function finishRun(
  runId: number,
  counts: { atomsCreated?: number; atomsReinforced?: number; linksCreated?: number; insightsCreated?: number },
) {
  await db
    .update(knowledgeRuns)
    .set({ ...counts, status: "succeeded", finishedAt: new Date() })
    .where(eq(knowledgeRuns.id, runId));
}

async function failRun(runId: number, error: unknown) {
  await db
    .update(knowledgeRuns)
    .set({
      status: "failed",
      error: error instanceof Error ? error.message : "Distillation failed",
      finishedAt: new Date(),
    })
    .where(eq(knowledgeRuns.id, runId));
}

/** Creates a brand-new atom plus its first evidence row. */
async function createAtom(
  candidate: AtomCandidate,
  embedding: number[] | null,
  noteId: number,
): Promise<number> {
  const [atom] = await db
    .insert(knowledgeAtoms)
    .values({
      kind: candidate.kind as AtomKind,
      statement: candidate.statement,
      detail: candidate.detail,
      confidence: candidate.confidence,
      salience: REINFORCED_SALIENCE,
      reinforcementCount: 1,
      origin: "auto",
      embedding,
    })
    .returning({ id: knowledgeAtoms.id });

  await db.insert(knowledgeAtomSources).values({
    atomId: atom.id,
    noteId,
    excerpt: candidate.excerpt,
    isReinforcement: false,
  });

  return atom.id;
}

/**
 * Strengthens an existing belief instead of duplicating it: bumps
 * confidence and the reinforcement counter, restores salience, and appends
 * this entry to the evidence trail.
 *
 * Guards against double-counting the same entry — re-distilling an entry
 * that already reinforced this atom updates nothing, which is what makes
 * the manual re-distill button safe to press repeatedly.
 */
async function reinforceAtom(
  atomId: number,
  candidate: AtomCandidate,
  noteId: number,
): Promise<boolean> {
  const already = await db.query.knowledgeAtomSources.findFirst({
    where: and(
      eq(knowledgeAtomSources.atomId, atomId),
      eq(knowledgeAtomSources.noteId, noteId),
    ),
  });
  if (already) return false;

  const existing = await db.query.knowledgeAtoms.findFirst({
    where: eq(knowledgeAtoms.id, atomId),
  });
  if (!existing) return false;

  await db
    .update(knowledgeAtoms)
    .set({
      confidence: reinforcedConfidence(existing.confidence, candidate.confidence),
      salience: REINFORCED_SALIENCE,
      reinforcementCount: existing.reinforcementCount + 1,
      lastReinforcedAt: new Date(),
      updatedAt: new Date(),
      // A later observation often states the same belief more precisely —
      // adopt the longer detail rather than discarding it, but never
      // overwrite the statement itself (that would rewrite history on an
      // atom the owner may have edited by hand).
      detail:
        candidate.detail.length > existing.detail.length ? candidate.detail : existing.detail,
    })
    .where(eq(knowledgeAtoms.id, atomId));

  await db.insert(knowledgeAtomSources).values({
    atomId,
    noteId,
    excerpt: candidate.excerpt,
    isReinforcement: true,
  });

  return true;
}

async function linkAtoms(
  fromAtomId: number,
  toAtomId: number,
  linkType: AtomLinkType,
  rationale: string,
): Promise<boolean> {
  if (fromAtomId === toAtomId) return false;
  try {
    await db
      .insert(knowledgeLinks)
      .values({ fromAtomId, toAtomId, linkType, rationale, origin: "auto" })
      .onConflictDoNothing();
    return true;
  } catch (err) {
    console.error("[knowledge] failed to link atoms", err);
    return false;
  }
}

/**
 * Distills one diary entry into the knowledge base. Safe to re-run.
 */
export async function distillDiaryEntry(noteId: number): Promise<DistillResult> {
  const run = await startRun(noteId, "distill");

  try {
    const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
    const entry = await db.query.diaryEntries.findFirst({
      where: eq(diaryEntries.noteId, noteId),
    });
    if (!note || !entry) throw new Error("Diary entry not found");

    const content = await db.query.noteContent.findFirst({
      where: and(eq(noteContent.noteId, noteId), eq(noteContent.language, note.primaryLanguage)),
    });
    const body = content?.bodyMarkdown ?? "";

    // Not worth a model call — and more importantly, not worth polluting
    // the knowledge base with atoms extracted from three words.
    if (body.trim().length + entry.scratch.trim().length < 40) {
      await db
        .update(diaryEntries)
        .set({ distilledAt: new Date() })
        .where(eq(diaryEntries.id, entry.id));
      await finishRun(run.id, {});
      return { runId: run.id, atomsCreated: 0, atomsReinforced: 0, linksCreated: 0, skipped: "too short" };
    }

    const candidates = await extractKnowledgeAtoms({
      title: note.title,
      body,
      scratch: entry.scratch,
      occurredAt: entry.occurredAt,
    });

    if (candidates.length === 0) {
      await db
        .update(diaryEntries)
        .set({ distilledAt: new Date() })
        .where(eq(diaryEntries.id, entry.id));
      await finishRun(run.id, {});
      return { runId: run.id, atomsCreated: 0, atomsReinforced: 0, linksCreated: 0 };
    }

    // One batched embedding call for all candidates — nulls when
    // agent-server is unreachable, which downgrades matching to keywords
    // rather than failing the run (see embedTextsOrNull).
    const embeddings = await embedTextsOrNull(candidates.map((c) => c.statement));

    let atomsCreated = 0;
    let atomsReinforced = 0;
    let linksCreated = 0;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const embedding = embeddings[i];
      const matches = await findCandidates(
        candidate.statement,
        candidate.kind as AtomKind,
        embedding,
      );

      let handled = false;

      for (const match of matches) {
        // Sequential, not parallel: these are local-model calls against a
        // single Ollama instance (same reasoning as the translate loop in
        // tasks.ts — concurrent dispatch just queues them while each
        // call's own timeout keeps counting).
        const { verdict, rationale } = await reconcileAtom(candidate, {
          kind: match.kind,
          statement: match.statement,
          detail: match.detail,
        });

        if (verdict === "same") {
          if (await reinforceAtom(match.id, candidate, noteId)) atomsReinforced++;
          handled = true;
          break;
        }

        if (verdict === "contradicts") {
          // Both sides are kept and explicitly linked rather than one
          // silently overwriting the other — the owner decides which
          // belief survives, from the review queue on /assistant. This is
          // the mechanism that lets the model of them actually UPDATE.
          const newId = await createAtom(candidate, embedding, noteId);
          atomsCreated++;
          if (await linkAtoms(newId, match.id, "contradicts", rationale)) linksCreated++;
          handled = true;
          break;
        }

        if (verdict === "refines") {
          const newId = await createAtom(candidate, embedding, noteId);
          atomsCreated++;
          if (await linkAtoms(newId, match.id, "refines", rationale)) linksCreated++;
          handled = true;
          break;
        }
        // "distinct" — keep checking the remaining candidates.
      }

      if (!handled) {
        await createAtom(candidate, embedding, noteId);
        atomsCreated++;
      }
    }

    await db
      .update(diaryEntries)
      .set({ distilledAt: new Date() })
      .where(eq(diaryEntries.id, entry.id));

    await finishRun(run.id, { atomsCreated, atomsReinforced, linksCreated });
    return { runId: run.id, atomsCreated, atomsReinforced, linksCreated };
  } catch (err) {
    await failRun(run.id, err);
    throw err;
  }
}

/**
 * Erodes salience on atoms nothing has reinforced lately, so the "stale?"
 * queue on /assistant stays meaningful.
 *
 * Deliberately never deletes and never touches pinned atoms. An old belief
 * isn't wrong — it's just quiet, and the owner is the one who decides
 * whether quiet means finished. Auto-deletion here would destroy exactly
 * the long-range history that makes the knowledge base valuable.
 */
export async function decayAtoms(): Promise<{ decayed: number }> {
  const cutoff = new Date(Date.now() - DECAY_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const result = await db
    .update(knowledgeAtoms)
    .set({
      salience: sql`GREATEST(0.05, ${knowledgeAtoms.salience} * 0.8)`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(knowledgeAtoms.status, "active"),
        eq(knowledgeAtoms.pinned, false),
        lt(knowledgeAtoms.lastReinforcedAt, cutoff),
      ),
    )
    .returning({ id: knowledgeAtoms.id });

  return { decayed: result.length };
}

/** Diary entries that have never been successfully distilled — the backlog
 *  the assistant page offers to catch up on. */
export async function undistilledEntries(limit = 50) {
  return db
    .select({
      noteId: diaryEntries.noteId,
      title: notes.title,
      slug: notes.slug,
      occurredAt: diaryEntries.occurredAt,
    })
    .from(diaryEntries)
    .innerJoin(notes, eq(notes.id, diaryEntries.noteId))
    .where(isNull(diaryEntries.distilledAt))
    .orderBy(desc(diaryEntries.occurredAt))
    .limit(limit);
}

/** Unresolved contradictions — the review queue that keeps beliefs honest. */
export async function openContradictions(limit = 20) {
  return db
    .select({
      linkId: knowledgeLinks.id,
      rationale: knowledgeLinks.rationale,
      createdAt: knowledgeLinks.createdAt,
      fromAtomId: knowledgeLinks.fromAtomId,
      toAtomId: knowledgeLinks.toAtomId,
    })
    .from(knowledgeLinks)
    .where(
      and(
        eq(knowledgeLinks.linkType, "contradicts"),
        isNull(knowledgeLinks.resolvedAt),
        ne(knowledgeLinks.fromAtomId, knowledgeLinks.toAtomId),
      ),
    )
    .orderBy(desc(knowledgeLinks.createdAt))
    .limit(limit);
}
