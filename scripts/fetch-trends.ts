// Daily AI news/trends puller — run by .github/workflows/fetch-trends.yml
// once a day, not by anything inside the Next.js app itself (see the
// header comment on the trend_digests/trend_items tables in
// src/lib/db/schema.ts for why there's no in-app action for this).
//
// Pulls a handful of RSS feeds (news + arXiv papers) plus GitHub's repo
// search API (as a "trending AI repos" proxy — GitHub has no official
// trending feed), de-dupes against what's already stored by URL, writes a
// one-sentence bilingual (EN+ZH) AI summary per new item plus one
// structured bilingual overview (summary/insight/action items/watch list)
// per day, and upserts everything into Neon.
//
// Run locally with:
//   npx tsx scripts/fetch-trends.ts
// (needs DATABASE_URL in the environment, plus at least one of the AI
// chain's two rungs below — see .env.local for the same vars the app
// itself uses.)
//
// Uses relative imports (not the app's "@/..." aliases) on purpose: this
// script runs standalone via tsx, outside Next.js's module resolution, and
// relative paths don't depend on tsx also picking up tsconfig "paths".
import { desc, eq, inArray, or } from "drizzle-orm";
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { db } from "../src/lib/db";
import { trendDigests, trendItems, type TrendCategory } from "../src/lib/db/schema";
import { pickModel } from "./lib/pick-model";

const MAX_ITEMS_PER_FEED = 12;
const MAX_GITHUB_REPOS = 10;
// Bounds how many older rows get (re)summarized per run when backfilling —
// see backfillMissingSummaries below. Keeps a single run's AI-call budget
// predictable regardless of how large the backlog is; a big backlog just
// clears over several days' runs instead of one run.
const BACKFILL_BATCH_SIZE = 20;
// How many of the most recently-inserted items feed the daily
// overview/insight/action-items/watch-list — a rolling window rather than
// strictly "items inserted today", since most days now fetch zero brand-new
// items (the sources are largely re-serving already-captured articles) and
// a "today only" overview would then simply never get written. See
// writeDailyOverview's call site in main().
const OVERVIEW_WINDOW_SIZE = 60;

interface NormalizedItem {
  source: string;
  category: TrendCategory;
  title: string;
  url: string;
  description?: string;
  summary?: string;
  summaryZh?: string;
  publishedAt?: Date;
}

const RSS_SOURCES: { url: string; source: string; category: TrendCategory }[] = [
  { url: "https://www.technologyreview.com/feed/", source: "MIT Technology Review", category: "news" },
  { url: "https://www.artificialintelligence-news.com/feed/", source: "AI News", category: "news" },
  { url: "https://rss.arxiv.org/rss/cs.CL", source: "arXiv cs.CL", category: "paper" },
];

// --- tiny RSS parser (no dependency — RSS 2.0 <item> blocks are regular
// enough that a full XML parser is more machinery than this needs) ---

interface RssItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const title = decodeEntities(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const link = decodeEntities(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "").trim();
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim();
    const description = decodeEntities(block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? "")
      .replace(/<[^>]+>/g, "")
      .trim()
      .slice(0, 500);
    if (title && link) items.push({ title, link, pubDate, description });
  }
  return items;
}

async function fetchRssSource(feed: (typeof RSS_SOURCES)[number]): Promise<NormalizedItem[]> {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": "brainbank-trends-bot/1.0 (+daily AI digest)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  return parseRss(xml)
    .slice(0, MAX_ITEMS_PER_FEED)
    .map((item) => ({
      source: feed.source,
      category: feed.category,
      title: item.title.slice(0, 500),
      url: item.link,
      description: item.description ?? "",
      publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
    }));
}

// GitHub has no official "trending" API — this approximates it with the
// real Search API: recently-created AI-topic repos, ranked by stars.
async function fetchGithubTrending(): Promise<NormalizedItem[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const q = `(topic:llm OR topic:large-language-models OR topic:machine-learning OR topic:artificial-intelligence) created:>${since}`;
  const res = await fetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${MAX_GITHUB_REPOS}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "brainbank-trends-bot/1.0",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { items?: Record<string, unknown>[] };
  return (data.items ?? []).map((repo) => ({
    source: "GitHub Trending",
    category: "repo" as const,
    title: repo.description
      ? `${repo.full_name as string} — ${repo.description as string}`
      : (repo.full_name as string),
    url: repo.html_url as string,
    description: (repo.description as string) ?? "",
    publishedAt: repo.created_at ? new Date(repo.created_at as string) : undefined,
  }));
}

const itemSummarySchema = z.object({
  summaryEn: z.string().describe("One plain-English sentence: what/why this is worth a look. No preamble, no markdown."),
  summaryZh: z.string().describe("The same sentence in Simplified Chinese — a real translation, not a restatement."),
});

/** One AI call per item produces BOTH languages at once (rather than a
 * separate translation pass afterward) — same total call count as the
 * English-only version this replaced, since the model is already reading
 * the item once either way. */
async function summarizeItemBilingual(
  model: LanguageModel,
  item: NormalizedItem,
): Promise<{ en: string; zh: string }> {
  const { object } = await generateObject({
    model,
    maxOutputTokens: 300,
    abortSignal: AbortSignal.timeout(30_000),
    schema: itemSummarySchema,
    system:
      "You write single-sentence summaries of AI news articles, research papers, and GitHub repos for a busy reader, in both English and Simplified Chinese. The two fields must say the same thing — summaryZh is a translation of summaryEn, not an independent summary.",
    prompt: `Category: ${item.category}\nSource: ${item.source}\nTitle: ${item.title}${item.description ? `\nDescription: ${item.description}` : ""}`,
  });
  return {
    en: object.summaryEn.trim().slice(0, 300),
    zh: object.summaryZh.trim().slice(0, 300),
  };
}

/** Fills in `summary`/`summaryZh` for older rows that predate this field
 * (or predate the bilingual version of it) — without this, any item
 * inserted before summarizeItemBilingual existed stays permanently blank,
 * since main() only ever summarizes items at insert time. Self-heals a
 * backlog gradually (BACKFILL_BATCH_SIZE rows/run) rather than requiring a
 * one-off migration script. */
async function backfillMissingSummaries(model: LanguageModel): Promise<void> {
  const rows = await db
    .select({
      id: trendItems.id,
      category: trendItems.category,
      source: trendItems.source,
      title: trendItems.title,
      url: trendItems.url,
    })
    .from(trendItems)
    .where(or(eq(trendItems.summary, ""), eq(trendItems.summaryZh, "")))
    .limit(BACKFILL_BATCH_SIZE);

  if (rows.length === 0) return;
  console.log(`[trends] Backfilling summaries for ${rows.length} older item(s) missing one.`);

  for (const row of rows) {
    const summary = await summarizeItemBilingual(model, {
      source: row.source,
      category: row.category,
      title: row.title,
      url: row.url,
    }).catch((err) => {
      console.error(`[trends] Backfill summary failed for ${row.url}:`, err);
      return null;
    });
    if (!summary) continue;
    await db.update(trendItems).set({ summary: summary.en, summaryZh: summary.zh }).where(eq(trendItems.id, row.id));
  }
  console.log("[trends] Backfill pass done.");
}

const dailyOverviewSchema = z.object({
  overviewEn: z
    .string()
    .describe("3-5 plain-English sentences summarizing the day's AI news/research/repo activity. Prose only, no markdown, no headings."),
  overviewZh: z.string().describe("The same overview, written in Simplified Chinese (a real translation, not independent commentary)."),
  insight: z
    .string()
    .describe(
      "One or two sentences naming a non-obvious pattern or connection across TODAY's items specifically — not a generic AI-industry observation, not a restatement of any single item.",
    ),
  insightZh: z.string().describe("The insight, in Simplified Chinese."),
  actionItems: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe("3-5 concrete, specific things a reader building AI products or a personal knowledge system could actually do this week, grounded in today's specific items — not generic advice."),
  actionItemsZh: z.array(z.string()).min(3).max(5).describe("The same action items, in Simplified Chinese, same order."),
  watchList: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe("3-5 short phrases naming emerging signals from today's items worth monitoring but not yet actionable — a trend, a repo to watch, a policy development."),
  watchListZh: z.array(z.string()).min(3).max(5).describe("The same watch-list items, in Simplified Chinese, same order."),
});

async function writeDailyOverview(
  model: LanguageModel,
  date: string,
  items: { category: TrendCategory; title: string; source: string; summary: string }[],
) {
  const bulletList = items
    .map((i) => `- [${i.category}] ${i.title} (${i.source})${i.summary ? `: ${i.summary}` : ""}`)
    .join("\n");
  const { object } = await generateObject({
    model,
    maxOutputTokens: 1200,
    abortSignal: AbortSignal.timeout(45_000),
    schema: dailyOverviewSchema,
    system:
      "You analyze a day's pulled AI news/research/repo items for the top of a digest page read by someone building AI products and maintaining a personal knowledge base. Stay grounded in the specific items given — never invent details not present in the list. Write every field in both English and Simplified Chinese as instructed per-field; the Chinese fields are translations of their English counterparts, not independent commentary.",
    prompt: `Today is ${date}. Here's everything pulled today:\n${bulletList}`,
  });
  return object;
}

async function getOrCreateDigest(date: string): Promise<number> {
  const existing = await db.query.trendDigests.findFirst({ where: eq(trendDigests.date, date) });
  if (existing) return existing.id;
  const [created] = await db.insert(trendDigests).values({ date }).returning();
  return created.id;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const candidates: NormalizedItem[] = [];

  for (const feed of RSS_SOURCES) {
    try {
      candidates.push(...(await fetchRssSource(feed)));
    } catch (err) {
      console.error(`[trends] Failed to fetch ${feed.source}:`, err);
    }
  }

  try {
    candidates.push(...(await fetchGithubTrending()));
  } catch (err) {
    console.error("[trends] Failed to fetch GitHub trending:", err);
  }

  console.log(`[trends] Fetched ${candidates.length} candidate item(s) from ${RSS_SOURCES.length + 1} source(s).`);
  if (candidates.length === 0) {
    console.log("[trends] Nothing fetched — exiting without touching the DB.");
    return;
  }

  const urls = candidates.map((c) => c.url);
  const existingRows = await db.select({ url: trendItems.url }).from(trendItems).where(inArray(trendItems.url, urls));
  const existingUrls = new Set(existingRows.map((r) => r.url));
  const fresh = candidates.filter((c) => !existingUrls.has(c.url));

  console.log(`[trends] ${fresh.length} new item(s) after de-duping against ${existingUrls.size} already-stored URL(s).`);

  const { model, label } = await pickModel("[trends]");
  // getOrCreateDigest() up front regardless of fresh.length — a day with
  // zero brand-new items still gets its overview/insight refreshed below
  // from the rolling recent-items window, which is the whole point of this
  // no-longer-being-gated-on-"fresh" design (see OVERVIEW_WINDOW_SIZE's
  // comment).
  const digestId = await getOrCreateDigest(today);

  if (fresh.length > 0) {
    for (const item of fresh) {
      const summary = await summarizeItemBilingual(model, item).catch((err) => {
        console.error(`[trends] Summary failed for ${item.url}:`, err);
        return { en: "", zh: "" };
      });
      item.summary = summary.en;
      item.summaryZh = summary.zh;
    }

    const inserted = await db
      .insert(trendItems)
      .values(
        fresh.map((item) => ({
          digestId,
          category: item.category,
          source: item.source,
          title: item.title,
          url: item.url,
          summary: item.summary ?? "",
          summaryZh: item.summaryZh ?? "",
          publishedAt: item.publishedAt,
        })),
      )
      .onConflictDoNothing({ target: trendItems.url })
      .returning({ id: trendItems.id });

    console.log(`[trends] Inserted ${inserted.length} item(s) for ${today} (summarized via ${label}).`);
  } else {
    console.log("[trends] Nothing new today — still refreshing the overview from recent items below.");
  }

  await backfillMissingSummaries(model).catch((err) => {
    console.error("[trends] Backfill pass failed:", err);
  });

  const recentItems = await db
    .select({ category: trendItems.category, title: trendItems.title, source: trendItems.source, summary: trendItems.summary })
    .from(trendItems)
    .orderBy(desc(trendItems.createdAt))
    .limit(OVERVIEW_WINDOW_SIZE);

  if (recentItems.length === 0) {
    console.log("[trends] No items in the database yet — nothing to write an overview from.");
    return;
  }

  const overview = await writeDailyOverview(model, today, recentItems).catch((err) => {
    console.error("[trends] Daily overview failed:", err);
    return null;
  });

  if (overview) {
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
      .where(eq(trendDigests.id, digestId));
    console.log("[trends] Daily overview + insight/action-items/watch-list written.");
  }
}

main()
  .then(() => {
    console.log("[trends] Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[trends] Fatal error:", err);
    process.exit(1);
  });
