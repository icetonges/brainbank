import { db, isDatabaseConfigured } from "@/lib/db";
import {
  githubTrendingRuns,
  githubTrendingRepos,
  githubTrendingDevelopers,
  type TrendingCadence,
} from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { t, type Lang } from "@/lib/i18n";

// Rendered as a subsection of /trends (see src/app/trends/page.tsx) rather
// than its own route — it used to be a standalone /github-trending page,
// merged in on request since both are "what's happening in AI right now"
// digests and didn't need separate nav entries.
const CADENCE_ORDER: TrendingCadence[] = ["daily", "weekly", "monthly"];

type Repo = typeof githubTrendingRepos.$inferSelect;
type Developer = typeof githubTrendingDevelopers.$inferSelect;

interface RunData {
  date: string;
  repos: Repo[];
  developers: Developer[];
}

function formatSnapshotDate(dateKey: string, locale?: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString(locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

async function loadLatestRun(cadence: TrendingCadence): Promise<RunData | null> {
  const [run] = await db
    .select()
    .from(githubTrendingRuns)
    .where(eq(githubTrendingRuns.cadence, cadence))
    .orderBy(desc(githubTrendingRuns.date))
    .limit(1);
  if (!run) return null;

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

  return { date: run.date, repos, developers };
}

export async function GithubTrendingSection({ lang }: { lang: Lang }) {
  const s = t(lang).githubTrending;
  const dateLocale = lang === "zh" ? "zh-CN" : undefined;

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

  let runsByCadence: Record<TrendingCadence, RunData | null> = {
    daily: null,
    weekly: null,
    monthly: null,
  };
  let loadError = false;

  try {
    const results = await Promise.all(CADENCE_ORDER.map((c) => loadLatestRun(c)));
    runsByCadence = { daily: results[0], weekly: results[1], monthly: results[2] };
  } catch (err) {
    console.error("Failed to load GitHub Trending:", err);
    loadError = true;
  }

  return (
    <div id="github-trending" className="flex flex-col gap-8">
      <div>
        <h2 className="text-xl font-semibold text-fg">{s.title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-fg-secondary">{s.description}</p>
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
          const hasAnything = run && (run.repos.length > 0 || run.developers.length > 0);
          return (
            <section
              key={cadence}
              className="flex flex-col gap-5 border-b border-border pb-8 last:border-b-0"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-base font-semibold text-fg">{tabLabel[cadence]}</h3>
                {run && (
                  <span className="text-xs text-fg-secondary">
                    {s.snapshotFrom} {formatSnapshotDate(run.date, dateLocale)}
                  </span>
                )}
              </div>

              {!hasAnything ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-sm text-fg-secondary">
                  {s.empty}
                </div>
              ) : (
                <>
                  {run!.repos.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-accent">
                        {s.sectionRepositories}
                      </h4>
                      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {run!.repos.map((repo) => (
                          <li
                            key={repo.id}
                            className="flex flex-col gap-2 rounded-lg border border-border bg-bg-elevated p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <a
                                href={repo.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm font-medium text-fg hover:text-accent transition-colors"
                              >
                                {repo.fullName}
                              </a>
                              <span className="shrink-0 text-xs text-fg-secondary">
                                #{repo.rank}
                              </span>
                            </div>
                            {repo.description && (
                              <p className="text-xs leading-relaxed text-fg-secondary">
                                {repo.description}
                              </p>
                            )}
                            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                              {repo.language && (
                                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-secondary">
                                  {repo.language}
                                </span>
                              )}
                              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-secondary">
                                ★ {repo.stars.toLocaleString(dateLocale)}
                              </span>
                              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-secondary">
                                ⑂ {repo.forks.toLocaleString(dateLocale)}
                              </span>
                              {repo.starsInPeriod > 0 && (
                                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] text-accent">
                                  +{repo.starsInPeriod.toLocaleString(dateLocale)} {s.starsInPeriodSuffix}
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {run!.developers.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-accent">
                        {s.sectionDevelopers}
                      </h4>
                      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {run!.developers.map((dev) => (
                          <li
                            key={dev.id}
                            className="flex items-start gap-3 rounded-lg border border-border bg-bg-elevated p-3"
                          >
                            {dev.avatarUrl && (
                              // eslint-disable-next-line @next/next/no-img-element -- external avatar, not worth Next/Image config for a small snapshot thumbnail
                              <img
                                src={dev.avatarUrl}
                                alt=""
                                width={40}
                                height={40}
                                className="h-10 w-10 shrink-0 rounded-full"
                              />
                            )}
                            <div className="flex min-w-0 flex-col gap-1">
                              <div className="flex items-baseline gap-2">
                                <a
                                  href={dev.profileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="truncate text-sm font-medium text-fg hover:text-accent transition-colors"
                                >
                                  {dev.displayName}
                                </a>
                                <span className="shrink-0 text-xs text-fg-secondary">
                                  #{dev.rank}
                                </span>
                              </div>
                              <span className="text-xs text-fg-secondary">@{dev.username}</span>
                              {dev.popularRepoName && dev.popularRepoUrl && (
                                <a
                                  href={dev.popularRepoUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="truncate text-xs text-fg-secondary hover:text-accent transition-colors"
                                >
                                  {s.popularRepoPrefix} {dev.popularRepoName}
                                </a>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </section>
          );
        })}
    </div>
  );
}
