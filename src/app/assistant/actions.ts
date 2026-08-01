"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  knowledgeAtoms,
  knowledgeAtomSources,
  knowledgeLinks,
  knowledgeInsights,
  diaryEntries,
} from "@/lib/db/schema";
import type { AtomKind, InsightKind, InsightStatus } from "@/lib/db/schema";
import { eq, and, sql, isNull, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { runSynthesis, type SynthesisWindow } from "@/lib/knowledge/synthesize";
import { decayAtoms } from "@/lib/knowledge/distill";
import { dispatchDistillJob } from "@/lib/background-jobs";
import { embedTextsOrNull } from "@/lib/ai/embeddings";

// Curation surface for the knowledge base. The engine grows knowledge
// automatically; everything here is the MANUAL half — add, edit, pin,
// trim, merge, resolve — because a self-evolving system without a human
// steering wheel drifts, and the owner is the only authority on what's
// actually true about their own life.

async function requireOwner() {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
}

/** Re-embeds an atom after its statement changed, so similarity matching
 *  keeps working against the edited text rather than the original. */
async function reembed(atomId: number, statement: string) {
  const [embedding] = await embedTextsOrNull([statement]);
  if (embedding) {
    await db.update(knowledgeAtoms).set({ embedding }).where(eq(knowledgeAtoms.id, atomId));
  }
}

/** Manual knowledge growth — teach the assistant something directly,
 *  without waiting for it to appear in a diary entry. */
export async function addAtomAction(formData: FormData) {
  await requireOwner();

  const statement = String(formData.get("statement") ?? "").trim().slice(0, 500);
  const detail = String(formData.get("detail") ?? "").trim();
  const kind = String(formData.get("kind") ?? "fact") as AtomKind;

  if (statement.length < 3) throw new Error("Write a statement first");

  const [embedding] = await embedTextsOrNull([statement]);

  const [atom] = await db
    .insert(knowledgeAtoms)
    .values({
      kind,
      statement,
      detail,
      // Hand-entered knowledge starts trusted and pinned: the owner stating
      // something directly is stronger evidence than anything inferred, and
      // it should never quietly decay out of the base.
      confidence: 0.9,
      salience: 0.95,
      origin: "manual",
      pinned: true,
      embedding,
    })
    .returning({ id: knowledgeAtoms.id });

  await db.insert(knowledgeAtomSources).values({
    atomId: atom.id,
    noteId: null,
    excerpt: "Added by hand",
    isReinforcement: false,
  });

  revalidatePath("/assistant");
}

export async function updateAtomAction(
  atomId: number,
  statement: string,
  detail: string,
  kind: AtomKind,
) {
  await requireOwner();
  const trimmed = statement.trim().slice(0, 500);
  if (trimmed.length < 3) throw new Error("Statement is too short");

  await db
    .update(knowledgeAtoms)
    .set({ statement: trimmed, detail: detail.trim(), kind, updatedAt: new Date() })
    .where(eq(knowledgeAtoms.id, atomId));

  await reembed(atomId, trimmed);
  revalidatePath("/assistant");
}

/** Manual trim. Archives rather than deletes — an archived atom stays
 *  auditable and restorable, and its evidence trail survives. */
export async function archiveAtomAction(atomId: number, archived: boolean) {
  await requireOwner();
  await db
    .update(knowledgeAtoms)
    .set({ status: archived ? "archived" : "active", updatedAt: new Date() })
    .where(eq(knowledgeAtoms.id, atomId));
  revalidatePath("/assistant");
}

export async function pinAtomAction(atomId: number, pinned: boolean) {
  await requireOwner();
  await db
    .update(knowledgeAtoms)
    .set({
      pinned,
      // Pinning restores salience — the point of pinning is "this is still
      // true and still matters", which is exactly what salience encodes.
      ...(pinned ? { salience: 0.95 } : {}),
      updatedAt: new Date(),
    })
    .where(eq(knowledgeAtoms.id, atomId));
  revalidatePath("/assistant");
}

/**
 * Folds one atom into another: the loser is marked "merged", its evidence
 * is reassigned to the survivor, and the survivor absorbs its
 * reinforcement count. Used to clean up near-duplicates the reconcile step
 * judged "distinct" but a human can see are the same belief.
 */
export async function mergeAtomsAction(loserId: number, winnerId: number) {
  await requireOwner();
  if (loserId === winnerId) throw new Error("Can't merge an atom into itself");

  const loser = await db.query.knowledgeAtoms.findFirst({
    where: eq(knowledgeAtoms.id, loserId),
  });
  const winner = await db.query.knowledgeAtoms.findFirst({
    where: eq(knowledgeAtoms.id, winnerId),
  });
  if (!loser || !winner) throw new Error("Atom not found");

  // Move the evidence over so the survivor keeps the full provenance —
  // losing it would make the merged belief look less supported than it is.
  await db
    .update(knowledgeAtomSources)
    .set({ atomId: winnerId })
    .where(eq(knowledgeAtomSources.atomId, loserId));

  await db
    .update(knowledgeAtoms)
    .set({
      reinforcementCount: winner.reinforcementCount + loser.reinforcementCount,
      confidence: Math.max(winner.confidence, loser.confidence),
      salience: Math.max(winner.salience, loser.salience),
      detail: winner.detail.length >= loser.detail.length ? winner.detail : loser.detail,
      lastReinforcedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(knowledgeAtoms.id, winnerId));

  await db
    .update(knowledgeAtoms)
    .set({ status: "merged", mergedIntoId: winnerId, updatedAt: new Date() })
    .where(eq(knowledgeAtoms.id, loserId));

  revalidatePath("/assistant");
}

/** Marks a contradiction reviewed. The owner resolves the substance by
 *  editing or archiving one side; this just clears it from the queue. */
export async function resolveContradictionAction(linkId: number) {
  await requireOwner();
  await db
    .update(knowledgeLinks)
    .set({ resolvedAt: new Date() })
    .where(eq(knowledgeLinks.id, linkId));
  revalidatePath("/assistant");
}

export async function deleteLinkAction(linkId: number) {
  await requireOwner();
  await db.delete(knowledgeLinks).where(eq(knowledgeLinks.id, linkId));
  revalidatePath("/assistant");
}

export async function setInsightStatusAction(insightId: number, status: InsightStatus) {
  await requireOwner();
  await db
    .update(knowledgeInsights)
    .set({ status })
    .where(eq(knowledgeInsights.id, insightId));
  revalidatePath("/assistant");
}

/** On-demand synthesis — "think about what you know and tell me something". */
export async function synthesizeAction(formData: FormData) {
  await requireOwner();

  const window = (String(formData.get("window") ?? "week") || "week") as SynthesisWindow;
  const rawKinds = String(formData.get("kinds") ?? "").trim();
  const kinds = rawKinds
    ? (rawKinds.split(",").map((k) => k.trim()).filter(Boolean) as InsightKind[])
    : undefined;

  await runSynthesis(window, kinds);
  revalidatePath("/assistant");
}

// The three below are wired directly to <form action={...}>, so they
// return void rather than a result object — a form action's type is
// (formData) => void | Promise<void>, and returning a payload there
// wouldn't typecheck (nor reach anywhere, since nothing reads it). Their
// outcome shows up in the page's own numbers after revalidation instead.

/** Queues every never-distilled entry — the catch-up path after the Mac
 *  was asleep, or after importing a backlog of entries. */
export async function distillBacklogAction(): Promise<void> {
  await requireOwner();

  const pending = await db
    .select({ noteId: diaryEntries.noteId })
    .from(diaryEntries)
    .where(isNull(diaryEntries.distilledAt))
    .orderBy(desc(diaryEntries.occurredAt))
    .limit(25);

  for (const row of pending) {
    dispatchDistillJob({ noteId: row.noteId });
  }

  revalidatePath("/assistant");
}

export async function runDecayAction(): Promise<void> {
  await requireOwner();
  await decayAtoms();
  revalidatePath("/assistant");
}

/** Backfills embeddings for atoms created while agent-server was down —
 *  without this they'd never participate in semantic matching again. */
export async function backfillEmbeddingsAction(): Promise<void> {
  await requireOwner();

  const missing = await db
    .select({ id: knowledgeAtoms.id, statement: knowledgeAtoms.statement })
    .from(knowledgeAtoms)
    .where(and(eq(knowledgeAtoms.status, "active"), sql`${knowledgeAtoms.embedding} IS NULL`))
    .limit(100);

  if (missing.length === 0) return;

  const vectors = await embedTextsOrNull(missing.map((m) => m.statement));
  for (let i = 0; i < missing.length; i++) {
    const vec = vectors[i];
    if (!vec) continue;
    await db
      .update(knowledgeAtoms)
      .set({ embedding: vec })
      .where(eq(knowledgeAtoms.id, missing[i].id));
  }

  revalidatePath("/assistant");
}
