import { db, isDatabaseConfigured } from "@/lib/db";
import {
  githubTrendingRuns,
  githubTrendingRepos,
  type TrendingCadence,
  type TrendingTopicGroup,
} from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// One section per cadence, each showing only its latest run — stacked
// server-rendered sections (no client-side tabs), same simple pattern as
// /trends. A cadence with no run yet just renders its empty state rather
// than blocking the other two.
const CADENCE_ORDER: TrendingCadence[] = ["daily", "weekly", "monthly"];

type Repo = typeof githubTrendingRepos.$inferSelect;

function formatSnapshotDate(dateKey: string, locale?: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString(locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

async function loadLatestRun(
  cadence: TrendingCadence,
): Promise<{ date: string; repos: Repo[] } | null> {
  const [run] = await db
    .select()
    .from(githubTrendingRuns)
    .where(eq(githubTrendingRuns.cadence, cadence))
    .orderBy(desc(githubTrendingRuns.date))
    .limit(1);
  if (!run) return null;

  const repos = await db
    .select()
    .from(githubTrendingRepos)
    .where(eq(githubTrendingRepos.runId, run.id))
    .orderBy(desc(githubTrendingRepos.stars));

  return { date: run.date, repos };
}

export default async function GithubTrendingPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: langParam } = await searchParams;
  const lang = await getLang(langParam);
  const s = t(lang).githubTrending;
  const dateLocale = lang === "zh" ? "zh-CN" : undefined;

  const tabLabel: Record<TrendingCadence, string> = {
    daily: s.tabDaily,
    weekly: s.tabWeekly,
    monthly: s.tabMonthly,
  };
  const groupLabel: Record<TrendingTopicGroup, string> = {
    general: s.groupGeneral,
    "harness-knowledge": s.groupHarnessKnowledge,
  };

  if (!isDatabaseConfigured) {
    return (
      <div className="rounded-lg border border-border bg-bg-elevated p-5 text-fg-secondary">
        <p className="font-medium text-fg">{s.dbNotConfigured}</p>
        <p className="mt-1 text-sm">{s.dbNotConfiguredHint}</p>
      </div>
    );
  }

  let runsByCadence: Record<TrendingCadence, { date: string; repos: Repo[] } | null> = {
    daily: null,
    weekly: null,
    monthly: null,
  };
  let loadError = false;

  try {
    const results = await Promise.all(CADENCE_ORDER.map((c) => loadLatestRun(c)));
    runsByCadence = {
      daily: results[0],
      weekly: results[1],
      monthly: results[2],
    };
  } catch (err) {
    console.error("Failed to load GitHub Trending:", err);
    loadError = true;
  }

  return (
    <div className="flex w-full flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold text-fg">{s.title}</h1>
        <p className="mt-1 max-w-3xl text-fg-secondary">{s.description}</p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-danger/40 bg-bg-elevated p-5 text-fg-secondary">
          <p className="font-medium text-fg">{s.loadFailed}</p>
          <p className="mt-1 text-sm">{s.reload}</p>
        </div>
      )}

      {!loadError &&
        CADENCE_ORDER.map((cadence) => {
          const run = runsByCadence[cadence];
          return (
            <section
              key={cadence}
              className="flex flex-col gap-4 border-b border-border pb-8 last:border-b-0"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-semibold text-fg">{tabLabel[cadence]}</h2>
                {run && (
                  <span className="text-xs text-fg-secondary">
                    {s.snapshotFrom} {formatSnapshotDate(run.date, dateLocale)}
                  </span>
                )}
              </div>

              {!run || run.repos.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-sm text-fg-secondary">
                  {s.empty}
                </div>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {run.repos.map((repo) => (
                    <li
                      key={repo.id}
                      className="flex flex-col gap-2 rounded-lg border border-border bg-bg-elevated p-3"
                    >
                      <a
                        href={repo.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-fg hover:text-accent transition-colors"
                      >
                        {repo.fullName}
                      </a>
                      {repo.description && (
                        <p className="text-xs leading-relaxed text-fg-secondary">
                          {repo.description}
                        </p>
                      )}
                      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-secondary">
                          ★ {repo.stars.toLocaleString(dateLocale)} {s.stars}
                        </span>
                        {repo.language && (
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-secondary">
                            {repo.language}
                          </span>
                        )}
                        {repo.topicGroups.map((g) => (
                          <span
                            key={g}
                            className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] text-accent"
                          >
                            {groupLabel[g]}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
    </div>
  );
}
