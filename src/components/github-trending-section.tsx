import { db, isDatabaseConfigured } from "@/lib/db";
import {
  githubTrendingRuns,
  githubTrendingRepos,
  githubTrendingDevelopers,
  type TrendingCadence,
} from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { t, type Lang } from "@/lib/i18n";
import { GithubTrendingTabs, type CadenceView } from "@/components/github-trending-tabs";

// Rendered as a subsection of /trends (see src/app/trends/page.tsx) rather
// than its own route — it used to be a standalone /github-trending page,
// merged in on request since both are "what's happening in AI right now"
// digests and didn't need separate nav entries.
//
// Data fetching stays server-side (this file); only the daily/weekly/monthly
// tab switch itself is client-interactive (see github-trending-tabs.tsx) —
// all three cadences' data is fetched up front so switching tabs is instant,
// no client-side refetch/loading state needed.
const CADENCE_ORDER: TrendingCadence[] = ["daily", "weekly", "monthly"];

async function loadLatestRun(cadence: TrendingCadence, isZh: boolean): Promise<CadenceView> {
  const [run] = await db
    .select()
    .from(githubTrendingRuns)
    .where(eq(githubTrendingRuns.cadence, cadence))
    .orderBy(desc(githubTrendingRuns.date))
    .limit(1);
  if (!run) return { date: null, repos: [], developers: [] };

  const [repos, developers] = await Promise.all([
    db
      .select()
      .from(githubTrendingRepos)
      .where(eq(githubTrendingRepos.runId, run.id))
      .orderBy(githubTrendingRepos.rank),
    db
      .select()
      .from(githubTrendingDevelopers)
      .where(eq(githubTrendingDevelopers.runId, run.id))
      .orderBy(githubTrendingDevelopers.rank),
  ]);

  return {
    date: run.date,
    // Trimmed to plain, already-serializable view models (no Date fields)
    // before crossing the server->client component boundary. Only
    // `description` is language-dependent (picked here, server-side, so
    // the client tabs component stays dumb) — fullName/url/language/
    // stars/forks are identifiers/data, never translated, per the schema
    // comment on descriptionZh.
    repos: repos.map((r) => ({
      id: r.id,
      rank: r.rank,
      fullName: r.fullName,
      url: r.url,
      description: isZh && r.descriptionZh ? r.descriptionZh : r.description,
      language: r.language,
      stars: r.stars,
      forks: r.forks,
      starsInPeriod: r.starsInPeriod,
    })),
    developers: developers.map((d) => ({
      id: d.id,
      rank: d.rank,
      username: d.username,
      displayName: d.displayName,
      profileUrl: d.profileUrl,
      avatarUrl: d.avatarUrl,
      popularRepoName: d.popularRepoName,
      popularRepoUrl: d.popularRepoUrl,
    })),
  };
}

export async function GithubTrendingSection({ lang }: { lang: Lang }) {
  const s = t(lang).githubTrending;
  const isZh = lang === "zh";

  const tabLabel: Record<TrendingCadence, string> = {
    daily: s.tabDaily,
    weekly: s.tabWeekly,
    monthly: s.tabMonthly,
  };

  if (!isDatabaseConfigured) {
    return (
      <div id="github-trending" className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-fg">{s.title}</h2>
        <div className="rounded-lg border border-border bg-bg-elevated p-5 text-fg-secondary">
          <p className="font-medium text-fg">{s.dbNotConfigured}</p>
          <p className="mt-1 text-sm">{s.dbNotConfiguredHint}</p>
        </div>
      </div>
    );
  }

  let data: Record<TrendingCadence, CadenceView> = {
    daily: { date: null, repos: [], developers: [] },
    weekly: { date: null, repos: [], developers: [] },
    monthly: { date: null, repos: [], developers: [] },
  };
  let loadError = false;

  try {
    const results = await Promise.all(CADENCE_ORDER.map((c) => loadLatestRun(c, isZh)));
    data = { daily: results[0], weekly: results[1], monthly: results[2] };
  } catch (err) {
    console.error("Failed to load GitHub Trending:", err);
    loadError = true;
  }

  return (
    <div id="github-trending" className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-fg">{s.title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-fg-secondary">{s.description}</p>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-danger/40 bg-bg-elevated p-5 text-fg-secondary">
          <p className="font-medium text-fg">{s.loadFailed}</p>
          <p className="mt-1 text-sm">{s.reload}</p>
        </div>
      ) : (
        <GithubTrendingTabs
          data={data}
          labels={tabLabel}
          strings={{
            sectionRepositories: s.sectionRepositories,
            sectionDevelopers: s.sectionDevelopers,
            starsInPeriodSuffix: s.starsInPeriodSuffix,
            popularRepoPrefix: s.popularRepoPrefix,
            snapshotFrom: s.snapshotFrom,
            empty: s.empty,
          }}
          dateLocale={lang === "zh" ? "zh-CN" : undefined}
        />
      )}
    </div>
  );
}
