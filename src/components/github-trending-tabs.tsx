"use client";

import { useState } from "react";
import type { TrendingCadence } from "@/lib/db/schema";

// Client component: only the tab-switching needs interactivity, so this is
// intentionally the smallest possible client boundary — data for all three
// cadences is fetched server-side (see github-trending-section.tsx) and
// handed down as plain, already-serializable props (no Date objects; dates
// are the same "YYYY-MM-DD" strings used elsewhere in this app).

export interface RepoView {
  id: number;
  rank: number;
  fullName: string;
  url: string;
  description: string;
  language: string | null;
  stars: number;
  forks: number;
  starsInPeriod: number;
}

export interface DeveloperView {
  id: number;
  rank: number;
  username: string;
  displayName: string;
  profileUrl: string;
  avatarUrl: string;
  popularRepoName: string | null;
  popularRepoUrl: string | null;
}

export interface CadenceView {
  date: string | null;
  repos: RepoView[];
  developers: DeveloperView[];
}

interface Strings {
  sectionRepositories: string;
  sectionDevelopers: string;
  starsInPeriodSuffix: string;
  popularRepoPrefix: string;
  snapshotFrom: string;
  empty: string;
}

const CADENCE_ORDER: TrendingCadence[] = ["daily", "weekly", "monthly"];

function formatSnapshotDate(dateKey: string, locale?: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString(locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function GithubTrendingTabs({
  data,
  labels,
  strings: s,
  dateLocale,
}: {
  data: Record<TrendingCadence, CadenceView>;
  labels: Record<TrendingCadence, string>;
  strings: Strings;
  dateLocale?: string;
}) {
  const [active, setActive] = useState<TrendingCadence>("daily");
  const run = data[active];
  const hasAnything = run.repos.length > 0 || run.developers.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4 border-b border-border">
        <div className="flex items-center gap-1">
          {CADENCE_ORDER.map((cadence) => (
            <button
              key={cadence}
              type="button"
              onClick={() => setActive(cadence)}
              aria-pressed={active === cadence}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active === cadence
                  ? "border-accent text-fg"
                  : "border-transparent text-fg-secondary hover:text-fg"
              }`}
            >
              {labels[cadence]}
            </button>
          ))}
        </div>
        {run.date && (
          <span className="shrink-0 pb-2 text-xs text-fg-secondary">
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
          {run.repos.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-accent">
                {s.sectionRepositories}
              </h4>
              <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {run.repos.map((repo) => (
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
                      <span className="shrink-0 text-xs text-fg-secondary">#{repo.rank}</span>
                    </div>
                    {repo.description && (
                      <p className="text-xs leading-relaxed text-fg-secondary">{repo.description}</p>
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

          {run.developers.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-accent">
                {s.sectionDevelopers}
              </h4>
              <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {run.developers.map((dev) => (
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
                        <span className="shrink-0 text-xs text-fg-secondary">#{dev.rank}</span>
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
    </div>
  );
}
