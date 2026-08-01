import { db } from "@/lib/db";
import {
  knowledgeAtoms,
  knowledgeAtomSources,
  knowledgeInsights,
  knowledgeLinks,
  knowledgeRuns,
  diaryEntries,
  notes,
} from "@/lib/db/schema";
import { and, eq, sql, desc, isNull, count, gte, lt } from "drizzle-orm";

// Read models for the assistant page. Kept out of the page component so
// the page stays about rendering, and so the same shapes can back a future
// API route or scheduled digest without being re-derived.

export interface KnowledgeStats {
  totalAtoms: number;
  activeAtoms: number;
  archivedAtoms: number;
  pinnedAtoms: number;
  totalLinks: number;
  openContradictions: number;
  totalInsights: number;
  newInsights: number;
  starredInsights: number;
  diaryEntries: number;
  undistilled: number;
  /** Reinforcements across all atoms minus atom count — i.e. how much of
   *  the base is corroborated rather than single-sighting. The headline
   *  "is this thing actually learning?" number. */
  reinforcements: number;
  staleAtoms: number;
  lastRunAt: Date | null;
}

const STALE_SALIENCE = 0.25;

export async function knowledgeStats(): Promise<KnowledgeStats> {
  const [atomAgg] = await db
    .select({
      total: count(),
      active: sql<number>`COUNT(*) FILTER (WHERE ${knowledgeAtoms.status} = 'active')`,
      archived: sql<number>`COUNT(*) FILTER (WHERE ${knowledgeAtoms.status} = 'archived')`,
      pinned: sql<number>`COUNT(*) FILTER (WHERE ${knowledgeAtoms.pinned})`,
      stale: sql<number>`COUNT(*) FILTER (WHERE ${knowledgeAtoms.status} = 'active' AND NOT ${knowledgeAtoms.pinned} AND ${knowledgeAtoms.salience} < ${STALE_SALIENCE})`,
      reinforcements: sql<number>`COALESCE(SUM(${knowledgeAtoms.reinforcementCount}) - COUNT(*), 0)`,
    })
    .from(knowledgeAtoms);

  const [linkAgg] = await db
    .select({
      total: count(),
      openContradictions: sql<number>`COUNT(*) FILTER (WHERE ${knowledgeLinks.linkType} = 'contradicts' AND ${knowledgeLinks.resolvedAt} IS NULL)`,
    })
    .from(knowledgeLinks);

  const [insightAgg] = await db
    .select({
      total: count(),
      fresh: sql<number>`COUNT(*) FILTER (WHERE ${knowledgeInsights.status} = 'new')`,
      starred: sql<number>`COUNT(*) FILTER (WHERE ${knowledgeInsights.status} = 'starred')`,
    })
    .from(knowledgeInsights);

  const [entryAgg] = await db
    .select({
      total: count(),
      undistilled: sql<number>`COUNT(*) FILTER (WHERE ${diaryEntries.distilledAt} IS NULL)`,
    })
    .from(diaryEntries);

  const [lastRun] = await db
    .select({ finishedAt: knowledgeRuns.finishedAt })
    .from(knowledgeRuns)
    .where(eq(knowledgeRuns.status, "succeeded"))
    .orderBy(desc(knowledgeRuns.finishedAt))
    .limit(1);

  return {
    totalAtoms: Number(atomAgg?.total ?? 0),
    activeAtoms: Number(atomAgg?.active ?? 0),
    archivedAtoms: Number(atomAgg?.archived ?? 0),
    pinnedAtoms: Number(atomAgg?.pinned ?? 0),
    staleAtoms: Number(atomAgg?.stale ?? 0),
    reinforcements: Number(atomAgg?.reinforcements ?? 0),
    totalLinks: Number(linkAgg?.total ?? 0),
    openContradictions: Number(linkAgg?.openContradictions ?? 0),
    totalInsights: Number(insightAgg?.total ?? 0),
    newInsights: Number(insightAgg?.fresh ?? 0),
    starredInsights: Number(insightAgg?.starred ?? 0),
    diaryEntries: Number(entryAgg?.total ?? 0),
    undistilled: Number(entryAgg?.undistilled ?? 0),
    lastRunAt: lastRun?.finishedAt ?? null,
  };
}

export interface AtomNode {
  id: number;
  kind: string;
  statement: string;
  detail: string;
  confidence: number;
  salience: number;
  reinforcementCount: number;
  pinned: boolean;
  status: string;
  lastReinforcedAt: Date;
  sourceCount: number;
}

/** Active atoms for the constellation + manager, strongest first. */
export async function loadAtoms(limit = 300, includeArchived = false): Promise<AtomNode[]> {
  const rows = await db
    .select({
      id: knowledgeAtoms.id,
      kind: knowledgeAtoms.kind,
      statement: knowledgeAtoms.statement,
      detail: knowledgeAtoms.detail,
      confidence: knowledgeAtoms.confidence,
      salience: knowledgeAtoms.salience,
      reinforcementCount: knowledgeAtoms.reinforcementCount,
      pinned: knowledgeAtoms.pinned,
      status: knowledgeAtoms.status,
      lastReinforcedAt: knowledgeAtoms.lastReinforcedAt,
      sourceCount: sql<number>`(SELECT COUNT(*) FROM ${knowledgeAtomSources} WHERE ${knowledgeAtomSources.atomId} = ${knowledgeAtoms.id})`,
    })
    .from(knowledgeAtoms)
    .where(
      includeArchived
        ? sql`${knowledgeAtoms.status} <> 'merged'`
        : eq(knowledgeAtoms.status, "active"),
    )
    .orderBy(desc(knowledgeAtoms.salience), desc(knowledgeAtoms.reinforcementCount))
    .limit(limit);

  return rows.map((r) => ({ ...r, sourceCount: Number(r.sourceCount) }));
}

export interface AtomEdge {
  id: number;
  from: number;
  to: number;
  linkType: string;
  rationale: string;
  resolved: boolean;
}

export async function loadAtomLinks(limit = 600): Promise<AtomEdge[]> {
  const rows = await db
    .select({
      id: knowledgeLinks.id,
      from: knowledgeLinks.fromAtomId,
      to: knowledgeLinks.toAtomId,
      linkType: knowledgeLinks.linkType,
      rationale: knowledgeLinks.rationale,
      resolvedAt: knowledgeLinks.resolvedAt,
    })
    .from(knowledgeLinks)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    from: r.from,
    to: r.to,
    linkType: r.linkType,
    rationale: r.rationale,
    resolved: r.resolvedAt !== null,
  }));
}

export interface InsightRow {
  id: number;
  kind: string;
  title: string;
  body: string;
  status: string;
  createdAt: Date;
  atomCount: number;
}

export async function loadInsights(limit = 60): Promise<InsightRow[]> {
  const rows = await db
    .select({
      id: knowledgeInsights.id,
      kind: knowledgeInsights.kind,
      title: knowledgeInsights.title,
      body: knowledgeInsights.body,
      status: knowledgeInsights.status,
      createdAt: knowledgeInsights.createdAt,
      atomCount: sql<number>`(SELECT COUNT(*) FROM knowledge_insight_atoms kia WHERE kia.insight_id = ${knowledgeInsights.id})`,
    })
    .from(knowledgeInsights)
    .where(sql`${knowledgeInsights.status} <> 'dismissed'`)
    .orderBy(desc(knowledgeInsights.createdAt))
    .limit(limit);

  return rows.map((r) => ({ ...r, atomCount: Number(r.atomCount) }));
}

/** Atoms that have gone quiet — the manual-trim queue. */
export async function staleAtoms(limit = 30): Promise<AtomNode[]> {
  const rows = await db
    .select({
      id: knowledgeAtoms.id,
      kind: knowledgeAtoms.kind,
      statement: knowledgeAtoms.statement,
      detail: knowledgeAtoms.detail,
      confidence: knowledgeAtoms.confidence,
      salience: knowledgeAtoms.salience,
      reinforcementCount: knowledgeAtoms.reinforcementCount,
      pinned: knowledgeAtoms.pinned,
      status: knowledgeAtoms.status,
      lastReinforcedAt: knowledgeAtoms.lastReinforcedAt,
    })
    .from(knowledgeAtoms)
    .where(
      and(
        eq(knowledgeAtoms.status, "active"),
        eq(knowledgeAtoms.pinned, false),
        lt(knowledgeAtoms.salience, STALE_SALIENCE),
      ),
    )
    .orderBy(knowledgeAtoms.salience)
    .limit(limit);

  return rows.map((r) => ({ ...r, sourceCount: 0 }));
}

/** The evidence trail behind one atom — which entries produced it. */
export async function atomEvidence(atomId: number) {
  return db
    .select({
      id: knowledgeAtomSources.id,
      excerpt: knowledgeAtomSources.excerpt,
      isReinforcement: knowledgeAtomSources.isReinforcement,
      createdAt: knowledgeAtomSources.createdAt,
      noteSlug: notes.slug,
      noteTitle: notes.title,
    })
    .from(knowledgeAtomSources)
    .leftJoin(notes, eq(notes.id, knowledgeAtomSources.noteId))
    .where(eq(knowledgeAtomSources.atomId, atomId))
    .orderBy(desc(knowledgeAtomSources.createdAt));
}

/** Growth over time — how many atoms existed at the end of each of the
 *  last N weeks, for the sparkline on the assistant page. */
export async function atomGrowth(weeks = 12): Promise<{ week: string; total: number }[]> {
  const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      week: sql<string>`TO_CHAR(DATE_TRUNC('week', ${knowledgeAtoms.firstSeenAt}), 'YYYY-MM-DD')`,
      added: count(),
    })
    .from(knowledgeAtoms)
    .where(gte(knowledgeAtoms.firstSeenAt, since))
    .groupBy(sql`DATE_TRUNC('week', ${knowledgeAtoms.firstSeenAt})`)
    .orderBy(sql`DATE_TRUNC('week', ${knowledgeAtoms.firstSeenAt})`);

  // Running total, so the sparkline shows accumulation rather than a noisy
  // per-week bar chart.
  let running = 0;
  return rows.map((r) => {
    running += Number(r.added);
    return { week: r.week, total: running };
  });
}

/** Diary entries with no distillation yet — surfaced as a catch-up prompt. */
export async function undistilledCount(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(diaryEntries)
    .where(isNull(diaryEntries.distilledAt));
  return Number(row?.n ?? 0);
}
