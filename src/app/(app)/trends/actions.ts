"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { trendDigests, trendItems, githubTrendingRuns, githubTrendingRepos } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { generateTrendsOverview } from "@/lib/ai/tasks";
import { MODELS, type ModelId } from "@/lib/ai/models";

async function requireOwner() {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
}

// How many of the most recently-pulled news/paper/repo items feed the
// on-demand overview — same rolling-window idea and size as
// scripts/fetch-trends.ts's OVERVIEW_WINDOW_SIZE, kept in sync manually
// since this file can't import that script (see its header comment on why
// it uses relative imports and stays standalone).
const OVERVIEW_WINDOW_SIZE = 60;
const GITHUB_REPOS_LIMIT = 15;

/**
 * On-demand counterpart to the daily cron's overview step — lets the owner
 * generate (or regenerate, with a different model) today's AI summary
 * right now from whatever news/papers/repos and GitHub Trending data are
 * already sitting in the DB, instead of only ever getting a summary once a
 * day whenever the GitHub Actions cron happens to run. Reads, never
 * re-fetches — if nothing's been pulled yet at all, there's nothing here
 * to summarize (the fetch cron / fetch-github-trending workflows are still
 * what populate the underlying items).
 */
export async function generateTodaysSummaryAction(formData: FormData): Promise<void> {
  await requireOwner();

  const rawModelId = String(formData.get("modelId") ?? "");
  const modelId = MODELS.some((m) => m.id === rawModelId) ? (rawModelId as ModelId) : undefined;

  try {
    const today = new Date().toISOString().slice(0, 10);

    const [existingDigest] = await db
      .select({ id: trendDigests.id })
      .from(trendDigests)
      .where(eq(trendDigests.date, today))
      .limit(1);

    const digestId =
      existingDigest?.id ??
      (
        await db
          .insert(trendDigests)
          .values({ date: today })
          .onConflictDoNothing({ target: trendDigests.date })
          .returning({ id: trendDigests.id })
      )[0]?.id;

    // onConflictDoNothing can return nothing if a concurrent request just
    // created today's row — re-read rather than assume.
    const resolvedDigestId =
      digestId ??
      (
        await db.select({ id: trendDigests.id }).from(trendDigests).where(eq(trendDigests.date, today)).limit(1)
      )[0]?.id;

    if (!resolvedDigestId) {
      throw new Error("Could not create or find today's digest row.");
    }

    const items = await db
      .select({
        category: trendItems.category,
        title: trendItems.title,
        source: trendItems.source,
        summary: trendItems.summary,
      })
      .from(trendItems)
      .orderBy(desc(trendItems.createdAt))
      .limit(OVERVIEW_WINDOW_SIZE);

    const [latestGithubRun] = await db
      .select({ id: githubTrendingRuns.id })
      .from(githubTrendingRuns)
      .where(eq(githubTrendingRuns.cadence, "daily"))
      .orderBy(desc(githubTrendingRuns.date))
      .limit(1);

    const githubRepos = latestGithubRun
      ? await db
          .select({
            fullName: githubTrendingRepos.fullName,
            description: githubTrendingRepos.description,
            language: githubTrendingRepos.language,
            stars: githubTrendingRepos.stars,
          })
          .from(githubTrendingRepos)
          .where(eq(githubTrendingRepos.runId, latestGithubRun.id))
          .orderBy(githubTrendingRepos.rank)
          .limit(GITHUB_REPOS_LIMIT)
      : [];

    if (items.length === 0 && githubRepos.length === 0) {
      throw new Error(
        "Nothing pulled yet to summarize — the daily fetch (fetch-trends.yml / fetch-github-trending workflows) hasn't run yet.",
      );
    }

    const overview = await generateTrendsOverview({ items, githubRepos }, modelId);

    await db
      .update(trendDigests)
      .set({
        summaryMarkdown: overview.overviewEn,
        summaryMarkdownZh: overview.overviewZh,
        insight: overview.insight,
        insightZh: overview.insightZh,
        actionItems: overview.actionItems,
        actionItemsZh: overview.actionItemsZh,
        watchList: overview.watchList,
        watchListZh: overview.watchListZh,
      })
      .where(eq(trendDigests.id, resolvedDigestId));
  } catch (error) {
    // Same "never crash the page over a bad model response" philosophy as
    // /assistant's synthesizeAction — logged server-side, page just lands
    // back on /trends without an updated summary rather than surfacing
    // Next's generic error overlay.
    console.error("Trends summary generation failed", error);
  }

  revalidatePath("/trends");
}
