// Daily AI news/trends puller — run by .github/workflows/fetch-trends.yml
// once a day, not by anything inside the Next.js app itself (see the
// header comment on the trend_digests/trend_items tables in
// src/lib/db/schema.ts for why there's no in-app action for this).
//
// Pulls a handful of RSS feeds (news + arXiv papers) plus GitHub's repo
// search API (as a "trending AI repos" proxy — GitHub has no official
// trending feed), de-dupes against what's already stored by URL, writes a
// one-sentence AI summary per new item plus one AI-written overview per
// day, and upserts everything into Neon.
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
import { eq, inArray } from "drizzle-orm";
import { generateText, type LanguageModel } from "ai";
import { db } from "../src/lib/db";
import { trendDigests, trendItems, type TrendCategory } from "../src/lib/db/schema";
import { resolveModel } from "../src/lib/ai/providers";
import { DEFAULT_MODEL_ID } from "../src/lib/ai/models";

const MAX_ITEMS_PER_FEED = 12;
const MAX_GITHUB_REPOS = 10;

interface NormalizedItem {
  source: string;
  category: TrendCategory;
  title: string;
  url: string;
  description?: string;
  summary?: string;
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

// --- AI model selection: local LLM first, Gemini as fallback ---
//
// The local models (default: qwen3.6-35b-a3b) run on the owner's own Mac,
// reached via a public Tailscale Funnel URL + shared-secret header — see
// providers.ts's local() and models.ts's header comment. That's a real
// public HTTPS endpoint, so unlike a private Tailscale mesh address, a
// GitHub Actions runner genuinely *can* reach it. What it can't guarantee
// is that the Mac is awake and Funnel is up at whatever moment the daily
// cron fires — an unattended run has no one to notice and wake it, unlike
// an interactive request from the app. So: try local first (free, private,
// matches "local by default"), and silently fall through to the Gemini
// commercial fallback — same FALLBACK_CHAIN order the rest of the app
// uses — if the local call fails for any reason. A day where the Mac
// happened to be asleep still gets its digest; it's just paid for that
// one day instead of free.
async function pickModel(): Promise<{ model: LanguageModel; label: "local" | "gemini" }> {
  const localConfigured = Boolean(process.env.LOCAL_LLM_FUNNEL_URL && process.env.LOCAL_LLM_SHARED_SECRET);

  if (localConfigured) {
    try {
      const local = resolveModel(DEFAULT_MODEL_ID); // "local/qwen3.6-35b-a3b"
      // resolveModel() only builds the client — this is the actual
      // reachability probe, so a sleeping Mac / down Funnel is caught here
      // rather than mid-way through summarizing real items.
      await generateText({
        model: local,
        prompt: "Reply with just: ok",
        maxOutputTokens: 10,
        abortSignal: AbortSignal.timeout(15_000),
      });
      console.log("[trends] Local LLM reachable — using it for today's summaries.");
      return { model: local, label: "local" };
    } catch (err) {
      console.warn(
        "[trends] Local LLM unreachable (Mac asleep, or Funnel down?) — falling back to Gemini for today:",
        err instanceof Error ? err.message : err,
      );
    }
  } else {
    console.log("[trends] LOCAL_LLM_FUNNEL_URL/LOCAL_LLM_SHARED_SECRET not set for this run — using Gemini.");
  }

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error(
      "Local LLM unavailable and GOOGLE_GENERATIVE_AI_API_KEY is not set — nothing left in the chain to summarize with.",
    );
  }
  return { model: resolveModel("google/gemini-2.5-flash-lite"), label: "gemini" };
}

async function summarizeItem(model: LanguageModel, item: NormalizedItem): Promise<string> {
  const { text } = await generateText({
    model,
    maxOutputTokens: 120,
    abortSignal: AbortSignal.timeout(30_000),
    system:
      "You write single-sentence, plain-English summaries of AI news articles, research papers, and GitHub repos for a busy reader. Output only the sentence — no preamble, no quotes, no markdown.",
    prompt: `Category: ${item.category}\nSource: ${item.source}\nTitle: ${item.title}${item.description ? `\nDescription: ${item.description}` : ""}`,
  });
  return text.trim().slice(0, 300);
}

async function writeDailyOverview(
  model: LanguageModel,
  date: string,
  items: { category: TrendCategory; title: string; source: string; summary: string }[],
): Promise<string> {
  const bulletList = items
    .map((i) => `- [${i.category}] ${i.title} (${i.source})${i.summary ? `: ${i.summary}` : ""}`)
    .join("\n");
  const { text } = await generateText({
    model,
    maxOutputTokens: 400,
    abortSignal: AbortSignal.timeout(30_000),
    system:
      "You write a short (3-5 sentence) plain-English overview of a day's AI news/research/repo activity for the top of a digest page. Mention specific items by name where it's useful. Prose only — no headings, no bullet points, no markdown formatting.",
    prompt: `Today is ${date}. Here's everything pulled today:\n${bulletList}`,
  });
  return text.trim();
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
  if (fresh.length === 0) {
    console.log("[trends] Nothing new today.");
    return;
  }

  const { model, label } = await pickModel();

  for (const item of fresh) {
    item.summary = await summarizeItem(model, item).catch((err) => {
      console.error(`[trends] Summary failed for ${item.url}:`, err);
      return "";
    });
  }

  const digestId = await getOrCreateDigest(today);

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
        publishedAt: item.publishedAt,
      })),
    )
    .onConflictDoNothing({ target: trendItems.url })
    .returning({ id: trendItems.id });

  console.log(`[trends] Inserted ${inserted.length} item(s) for ${today} (summarized via ${label}).`);

  const allTodayItems = await db
    .select({ category: trendItems.category, title: trendItems.title, source: trendItems.source, summary: trendItems.summary })
    .from(trendItems)
    .where(eq(trendItems.digestId, digestId));

  const overview = await writeDailyOverview(model, today, allTodayItems).catch((err) => {
    console.error("[trends] Daily overview failed:", err);
    return null;
  });

  if (overview) {
    await db.update(trendDigests).set({ summaryMarkdown: overview }).where(eq(trendDigests.id, digestId));
    console.log("[trends] Daily overview written.");
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
