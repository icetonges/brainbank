import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { formatDateTime } from "@/lib/date";
import {
  knowledgeStats,
  loadAtoms,
  loadAtomLinks,
  loadInsights,
  atomGrowth,
  staleAtoms,
} from "@/lib/knowledge/stats";
import { openContradictions } from "@/lib/knowledge/distill";
import { db } from "@/lib/db";
import { knowledgeAtoms } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { KnowledgeWorkbench, type WorkbenchAtom } from "@/components/knowledge-workbench";
import { InsightDeck, type DeckInsight } from "@/components/insight-deck";
import { PendingFormButton } from "@/components/pending-form-button";
import { GrowthSparkline } from "@/components/growth-sparkline";
import { ContradictionQueue } from "@/components/contradiction-queue";
import { AddAtomForm } from "@/components/add-atom-form";
import {
  synthesizeAction,
  distillBacklogAction,
  runDecayAction,
  backfillEmbeddingsAction,
} from "./actions";

export const dynamic = "force-dynamic";
// Synthesis is a single large generateObject call over up to 120 atoms —
// same reasoning as the classroom pages for why maxDuration lives on the
// page rather than in actions.ts (Server Actions inherit it from the
// invoking page). vercel.json covers src/app/assistant/** as the
// platform-level backstop.
export const maxDuration = 500;

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: langParam } = await searchParams;
  const session = await auth();
  if (!session) redirect("/login?callbackUrl=/assistant");

  const lang = await getLang(langParam);
  const s = t(lang).assistant;
  const dateLocale = lang === "zh" ? "zh-CN" : undefined;

  let stats = null;
  let atoms: WorkbenchAtom[] = [];
  let links: { id: number; from: number; to: number; linkType: string; resolved: boolean }[] = [];
  let insights: DeckInsight[] = [];
  let growth: { week: string; total: number }[] = [];
  let stale: Awaited<ReturnType<typeof staleAtoms>> = [];
  let contradictions: {
    linkId: number;
    rationale: string;
    a: { id: number; statement: string } | null;
    b: { id: number; statement: string } | null;
  }[] = [];
  let loadError = false;

  try {
    const [statsRow, atomRows, linkRows, insightRows, growthRows, staleRows, contraRows] =
      await Promise.all([
        knowledgeStats(),
        loadAtoms(300),
        loadAtomLinks(600),
        loadInsights(60),
        atomGrowth(16),
        staleAtoms(12),
        openContradictions(10),
      ]);

    stats = statsRow;
    links = linkRows;
    growth = growthRows;
    stale = staleRows;

    atoms = atomRows.map((a) => ({
      id: a.id,
      kind: a.kind,
      statement: a.statement,
      detail: a.detail,
      confidence: a.confidence,
      salience: a.salience,
      reinforcementCount: a.reinforcementCount,
      pinned: a.pinned,
      status: a.status,
      sourceCount: a.sourceCount,
      lastReinforcedAt: a.lastReinforcedAt.toISOString(),
    }));

    insights = insightRows.map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      body: i.body,
      status: i.status,
      createdAt: i.createdAt.toISOString(),
      atomCount: i.atomCount,
    }));

    // Resolve the two sides of each contradiction for the review queue.
    const contraIds = Array.from(
      new Set(contraRows.flatMap((c) => [c.fromAtomId, c.toAtomId])),
    );
    const contraAtoms = contraIds.length
      ? await db
          .select({ id: knowledgeAtoms.id, statement: knowledgeAtoms.statement })
          .from(knowledgeAtoms)
          .where(inArray(knowledgeAtoms.id, contraIds))
      : [];
    const contraById = new Map(contraAtoms.map((a) => [a.id, a]));
    contradictions = contraRows.map((c) => ({
      linkId: c.linkId,
      rationale: c.rationale,
      a: contraById.get(c.fromAtomId) ?? null,
      b: contraById.get(c.toAtomId) ?? null,
    }));
  } catch (err) {
    console.error("Failed to load assistant:", err);
    loadError = true;
  }

  if (loadError || !stats) {
    return (
      <div className="rounded-lg border border-danger/40 bg-bg-elevated p-5 text-fg-secondary">
        <p className="font-medium text-fg">{s.loadFailed}</p>
        <p className="mt-1 text-sm">{s.loadFailedHint}</p>
      </div>
    );
  }

  const isEmpty = stats.totalAtoms === 0;

  return (
    <div className="flex w-full flex-col gap-7">
      {/* Header: what the assistant currently is, in numbers. */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-fg">🧠 {s.title}</h1>
            <p className="mt-1 max-w-2xl text-fg-secondary">{s.description}</p>
          </div>
          <Link
            href="/diary/new"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 transition-opacity"
          >
            {s.writeEntry}
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            value={stats.activeAtoms}
            label={s.statKnows}
            hint={`${stats.pinnedAtoms} ${s.statPinned}`}
            accent="#3b82f6"
          />
          <StatCard
            value={stats.reinforcements}
            label={s.statCorroborated}
            hint={s.statCorroboratedHint}
            accent="#22c55e"
          />
          <StatCard
            value={stats.totalLinks}
            label={s.statConnections}
            hint={
              stats.openContradictions > 0
                ? `${stats.openContradictions} ${s.statTensions}`
                : s.statNoTensions
            }
            accent="#8b5cf6"
          />
          <StatCard
            value={stats.diaryEntries}
            label={s.statEntries}
            hint={
              stats.undistilled > 0 ? `${stats.undistilled} ${s.statPending}` : s.statAllDistilled
            }
            accent="#f59e0b"
          />
        </div>

        {growth.length > 1 && (
          <div className="rounded-2xl border border-border bg-bg-elevated p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-medium text-fg">{s.growthTitle}</span>
              <span className="text-xs text-fg-secondary">
                {stats.lastRunAt
                  ? `${s.lastThought} ${formatDateTime(stats.lastRunAt, dateLocale)}`
                  : s.neverRun}
              </span>
            </div>
            <GrowthSparkline points={growth} />
          </div>
        )}
      </header>

      {/* Engine controls — the manual half of "auto + manual growth". */}
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-bg-elevated p-4">
        <form action={synthesizeAction} className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-fg">{s.thinkAbout}</span>
          <select
            name="window"
            defaultValue="week"
            className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm text-fg outline-none focus:border-accent"
          >
            <option value="week">{s.windowWeek}</option>
            <option value="month">{s.windowMonth}</option>
            <option value="quarter">{s.windowQuarter}</option>
            <option value="all">{s.windowAll}</option>
          </select>
          <select
            name="kinds"
            defaultValue=""
            className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm text-fg outline-none focus:border-accent"
          >
            <option value="">{s.kindsAll}</option>
            <option value="highlight,theme">{s.kindsReflective}</option>
            <option value="idea,business">{s.kindsGenerative}</option>
            <option value="recommendation">{s.kindsActionable}</option>
          </select>
          <PendingFormButton
            label={`✨ ${s.think}`}
            pendingLabel={s.thinking}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:opacity-60 transition-opacity"
          />
        </form>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {stats.undistilled > 0 && (
            <form action={distillBacklogAction}>
              <PendingFormButton
                label={`⏳ ${s.catchUp} (${stats.undistilled})`}
                pendingLabel={s.queueing}
                className="rounded-lg border border-warn/60 px-3 py-1.5 text-sm font-medium text-warn hover:bg-warn hover:text-white disabled:opacity-60 transition-colors"
              />
            </form>
          )}
          <form action={backfillEmbeddingsAction}>
            <PendingFormButton
              label={s.backfill}
              pendingLabel={s.backfilling}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-fg-secondary hover:border-accent hover:text-accent disabled:opacity-60 transition-colors"
            />
          </form>
          <form action={runDecayAction}>
            <PendingFormButton
              label={s.runDecay}
              pendingLabel={s.decaying}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-fg-secondary hover:border-accent hover:text-accent disabled:opacity-60 transition-colors"
            />
          </form>
        </div>
      </section>

      {isEmpty ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="text-lg text-fg">{s.emptyTitle}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-fg-secondary">{s.emptyBody}</p>
          <Link
            href="/diary/new"
            className="mt-4 inline-block rounded-lg bg-accent px-5 py-2 font-semibold text-accent-fg hover:opacity-90"
          >
            {s.writeFirst}
          </Link>
        </div>
      ) : (
        <>
          {/* Contradictions first — unresolved tension is the highest-value
              thing to look at, and burying it would defeat the purpose. */}
          {contradictions.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
                ⚡ {s.tensionsTitle}
                <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-semibold text-danger">
                  {contradictions.length}
                </span>
              </h2>
              <p className="-mt-1 text-sm text-fg-secondary">{s.tensionsHint}</p>
              <ContradictionQueue items={contradictions} lang={lang} />
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-fg">💡 {s.insightsTitle}</h2>
            <InsightDeck insights={insights} lang={lang} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-fg">🌌 {s.mapTitle}</h2>
            <p className="-mt-1 text-sm text-fg-secondary">{s.mapHint}</p>
            <KnowledgeWorkbench atoms={atoms} links={links} lang={lang} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold text-fg">✍️ {s.teachTitle}</h2>
              <p className="-mt-1 text-sm text-fg-secondary">{s.teachHint}</p>
              <AddAtomForm lang={lang} />
            </section>

            {stale.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-fg">🍂 {s.staleTitle}</h2>
                <p className="-mt-1 text-sm text-fg-secondary">{s.staleHint}</p>
                <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-bg-elevated">
                  {stale.map((atom) => (
                    <li key={atom.id} className="flex items-start gap-2 px-4 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-fg">{atom.statement}</span>
                        <span className="text-xs text-fg-secondary">
                          {atom.kind} · {s.lastSeen}{" "}
                          {formatDateTime(atom.lastReinforcedAt, dateLocale)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-fg-secondary">{s.staleFooter}</p>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  value,
  label,
  hint,
  accent,
}: {
  value: number;
  label: string;
  hint: string;
  accent: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-2xl border border-border bg-bg-elevated p-4"
      style={{ borderLeftWidth: 3, borderLeftColor: accent }}
    >
      <span className="text-3xl font-bold tabular-nums text-fg">{value}</span>
      <span className="text-sm font-medium text-fg">{label}</span>
      <span className="text-xs text-fg-secondary">{hint}</span>
    </div>
  );
}
