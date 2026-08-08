import { db } from "@/lib/db";
import {
  knowledgeAtoms,
  knowledgeInsights,
  knowledgeInsightAtoms,
  knowledgeRuns,
} from "@/lib/db/schema";
import type { InsightKind } from "@/lib/db/schema";
import { and, eq, gte, desc, sql } from "drizzle-orm";
import { synthesizeInsights } from "@/lib/ai/tasks";
import type { ModelId } from "@/lib/ai/models";

// Turning accumulated atoms into things worth reading: highlights, themes,
// ideas, business angles.
//
// Runs over ATOMS, not raw diary entries — which is both why it's allowed
// on the normal model chain (see the privacy note in tasks.ts) and why it
// produces better output: the model reasons over a hundred distilled
// claims instead of drowning in a hundred pages of prose.

export type SynthesisWindow = "week" | "month" | "quarter" | "all";

const WINDOW_DAYS: Record<Exclude<SynthesisWindow, "all">, number> = {
  week: 7,
  month: 31,
  quarter: 92,
};

const WINDOW_LABEL: Record<SynthesisWindow, string> = {
  week: "the past week",
  month: "the past month",
  quarter: "the past quarter",
  all: "all time",
};

/** How many atoms to feed one synthesis pass. Enough for real cross-
 *  connection, bounded so the prompt stays inside a comfortable context
 *  window on the local model. */
const MAX_ATOMS_PER_PASS = 120;

/**
 * Selects the atoms a synthesis pass should reason over.
 *
 * Ordering is deliberate: the most *established* knowledge (reinforcement
 * count) and the most *live* knowledge (salience) both matter, so it ranks
 * by a blend rather than pure recency. A one-off observation from
 * yesterday shouldn't outrank a pattern confirmed a dozen times.
 */
export async function atomsForSynthesis(window: SynthesisWindow) {
  const rankScore = sql<number>`(${knowledgeAtoms.salience} * 0.6)
    + (LEAST(${knowledgeAtoms.reinforcementCount}, 10) / 10.0 * 0.3)
    + (${knowledgeAtoms.confidence} * 0.1)`;

  const since =
    window === "all"
      ? undefined
      : new Date(Date.now() - WINDOW_DAYS[window] * 24 * 60 * 60 * 1000);

  return db
    .select({
      id: knowledgeAtoms.id,
      kind: knowledgeAtoms.kind,
      statement: knowledgeAtoms.statement,
      detail: knowledgeAtoms.detail,
      reinforcementCount: knowledgeAtoms.reinforcementCount,
    })
    .from(knowledgeAtoms)
    .where(
      and(
        eq(knowledgeAtoms.status, "active"),
        since ? gte(knowledgeAtoms.lastReinforcedAt, since) : undefined,
      ),
    )
    .orderBy(desc(rankScore))
    .limit(MAX_ATOMS_PER_PASS);
}

export interface SynthesisResult {
  runId: number;
  insightsCreated: number;
  atomsConsidered: number;
}

/**
 * Generates a fresh batch of insights over the given window and stores
 * them with their supporting-atom links.
 *
 * Previous insights are NOT deleted — they're history, and a starred one
 * from three months ago is often more valuable than anything generated
 * today. The UI groups by recency instead.
 */
export async function runSynthesis(
  window: SynthesisWindow = "week",
  kinds?: InsightKind[],
  /** Explicit model override from the assistant page's picker — falls
   *  through to TASK_MODELS.synthesize (see synthesizeInsights) when
   *  omitted, same as every other task in the app. */
  modelId?: ModelId,
): Promise<SynthesisResult> {
  const [run] = await db
    .insert(knowledgeRuns)
    .values({ kind: "synthesize", status: "running", startedAt: new Date() })
    .returning();

  try {
    const atoms = await atomsForSynthesis(window);

    if (atoms.length === 0) {
      await db
        .update(knowledgeRuns)
        .set({ status: "succeeded", finishedAt: new Date() })
        .where(eq(knowledgeRuns.id, run.id));
      return { runId: run.id, insightsCreated: 0, atomsConsidered: 0 };
    }

    const usedModels = new Set<ModelId>();
    const insights = await synthesizeInsights(
      {
        atoms: atoms.map((a) => ({
          kind: a.kind,
          statement: a.statement,
          detail: a.detail,
          reinforcementCount: a.reinforcementCount,
        })),
        periodLabel: WINDOW_LABEL[window],
        kinds,
      },
      modelId,
      (id) => usedModels.add(id),
    );

    const periodEnd = new Date();
    const periodStart =
      window === "all"
        ? null
        : new Date(Date.now() - WINDOW_DAYS[window] * 24 * 60 * 60 * 1000);

    let insightsCreated = 0;
    for (const insight of insights) {
      if (!insight.title.trim()) continue;

      const [row] = await db
        .insert(knowledgeInsights)
        .values({
          kind: insight.kind as InsightKind,
          title: insight.title,
          body: insight.body,
          periodStart,
          periodEnd,
          generatedModel: Array.from(usedModels).join(",") || null,
        })
        .returning({ id: knowledgeInsights.id });

      // The "show your work" trail — every insight stays traceable to the
      // atoms behind it, so a business suggestion can be interrogated
      // rather than taken on faith.
      const atomIds = insight.atomIndexes
        .map((i) => atoms[i]?.id)
        .filter((id): id is number => typeof id === "number");

      if (atomIds.length > 0) {
        await db
          .insert(knowledgeInsightAtoms)
          .values(atomIds.map((atomId) => ({ insightId: row.id, atomId })))
          .onConflictDoNothing();
      }

      insightsCreated++;
    }

    await db
      .update(knowledgeRuns)
      .set({ insightsCreated, status: "succeeded", finishedAt: new Date() })
      .where(eq(knowledgeRuns.id, run.id));

    return { runId: run.id, insightsCreated, atomsConsidered: atoms.length };
  } catch (err) {
    await db
      .update(knowledgeRuns)
      .set({
        status: "failed",
        error: err instanceof Error ? err.message : "Synthesis failed",
        finishedAt: new Date(),
      })
      .where(eq(knowledgeRuns.id, run.id));
    throw err;
  }
}
