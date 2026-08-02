// GitHub AI-repo "trending" snapshot — run on three independent cadences by
// .github/workflows/fetch-github-trending-{daily,weekly,monthly}.yml, each
// setting TRENDING_CADENCE before calling this script.
//
// This is deliberately a separate feature from the "repo" category inside
// scripts/fetch-trends.ts / the Trends tab: that one is a continuously
// growing, de-duped-by-URL feed. This one is a snapshot — each run
// re-queries GitHub's Search API for AI-topic repos created within its own
// cadence window (daily=1 day, weekly=7 days, monthly=30 days), ranked by
// stars, same "recently created + starred, as a trending proxy" approach as
// the original script (GitHub has no official trending API). The same repo
// can legitimately show up again next run — it's not trying to be an
// append-only archive, so there's no cross-run de-duplication.
//
// Two topic groups are queried separately so the page can tell "general
// AI/LLM" apart from "agent harness / knowledge graph / knowledge
// management" repos rather than lumping everything into one undifferentiated
// list — see schema.ts's trendingTopicGroupEnum comment.
//
// No AI summarization step here on purpose (unlike fetch-trends.ts) —
// GitHub already supplies a repo description, and skipping the local-LLM/
// Gemini chain means this feature doesn't depend on the owner's Mac being
// awake to produce useful output.
//
// Run locally with:
//   TRENDING_CADENCE=daily npx tsx scripts/fetch-github-trending.ts
// (needs DATABASE_URL in the environment; GITHUB_TOKEN is optional locally
// but raises the Search API's rate limit, same as fetch-trends.ts.)
import { and, eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  githubTrendingRuns,
  githubTrendingRepos,
  type TrendingCadence,
  type TrendingTopicGroup,
} from "../src/lib/db/schema";

const CADENCE_DAYS: Record<TrendingCadence, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

// Capped per topic group (not per final list) — a repo matching both groups
// counts against both caps but only produces one merged row, so the final
// list is at most 2x this, not exactly this.
const MAX_REPOS_PER_GROUP = 15;

const TOPIC_GROUPS: { group: TrendingTopicGroup; topics: string[] }[] = [
  {
    group: "general",
    topics: ["llm", "large-language-models", "machine-learning", "artificial-intelligence"],
  },
  {
    group: "harness-knowledge",
    topics: [
      "agent",
      "ai-agent",
      "agentic",
      "llm-agent",
      "coding-agent",
      "knowledge-graph",
      "knowledge-management",
      "rag",
    ],
  },
];

interface RawRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  topics?: string[];
  created_at: string;
}

interface MergedRepo {
  fullName: string;
  url: string;
  description: string;
  stars: number;
  language: string | null;
  matchedTopics: Set<string>;
  topicGroups: Set<TrendingTopicGroup>;
  repoCreatedAt: Date | undefined;
}

function parseCadence(): TrendingCadence {
  const raw = process.env.TRENDING_CADENCE;
  if (raw === "daily" || raw === "weekly" || raw === "monthly") return raw;
  throw new Error(
    `TRENDING_CADENCE must be one of "daily"/"weekly"/"monthly" — got ${JSON.stringify(raw)}.`,
  );
}

async function fetchTopicGroup(
  group: TrendingTopicGroup,
  topics: string[],
  sinceDate: string,
): Promise<RawRepo[]> {
  const topicClause = topics.map((t) => `topic:${t}`).join(" OR ");
  const q = `(${topicClause}) created:>${sinceDate}`;
  const res = await fetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${MAX_REPOS_PER_GROUP}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "brainbank-trends-bot/1.0",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} for topic group "${group}"`);
  const data = (await res.json()) as { items?: RawRepo[] };
  return data.items ?? [];
}

function mergeRepos(
  results: { group: TrendingTopicGroup; topics: string[]; repos: RawRepo[] }[],
): MergedRepo[] {
  const byFullName = new Map<string, MergedRepo>();

  for (const { group, topics, repos } of results) {
    for (const repo of repos) {
      const repoTopics = repo.topics ?? [];
      const matched = repoTopics.filter((t) => topics.includes(t));
      const existing = byFullName.get(repo.full_name);
      if (existing) {
        existing.topicGroups.add(group);
        for (const m of matched) existing.matchedTopics.add(m);
        continue;
      }
      byFullName.set(repo.full_name, {
        fullName: repo.full_name,
        url: repo.html_url,
        description: repo.description ?? "",
        stars: repo.stargazers_count,
        language: repo.language,
        matchedTopics: new Set(matched),
        topicGroups: new Set([group]),
        repoCreatedAt: repo.created_at ? new Date(repo.created_at) : undefined,
      });
    }
  }

  return [...byFullName.values()].sort((a, b) => b.stars - a.stars);
}

async function getOrCreateRun(cadence: TrendingCadence, date: string): Promise<number> {
  const [existing] = await db
    .select({ id: githubTrendingRuns.id })
    .from(githubTrendingRuns)
    .where(and(eq(githubTrendingRuns.cadence, cadence), eq(githubTrendingRuns.date, date)));
  if (existing) {
    // Re-running the same day (e.g. a manual workflow_dispatch) replaces
    // that day's repos rather than piling up duplicates.
    await db.delete(githubTrendingRepos).where(eq(githubTrendingRepos.runId, existing.id));
    return existing.id;
  }
  const [created] = await db.insert(githubTrendingRuns).values({ cadence, date }).returning();
  return created.id;
}

async function main() {
  const cadence = parseCadence();
  const days = CADENCE_DAYS[cadence];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  console.log(`[github-trending] cadence=${cadence} window=created:>${since}`);

  const results: { group: TrendingTopicGroup; topics: string[]; repos: RawRepo[] }[] = [];
  for (const { group, topics } of TOPIC_GROUPS) {
    try {
      const repos = await fetchTopicGroup(group, topics, since);
      console.log(`[github-trending] "${group}" — ${repos.length} repo(s).`);
      results.push({ group, topics, repos });
    } catch (err) {
      console.error(`[github-trending] Failed to fetch topic group "${group}":`, err);
    }
  }

  const merged = mergeRepos(results);
  console.log(`[github-trending] ${merged.length} unique repo(s) after merging topic groups.`);

  if (merged.length === 0) {
    console.log("[github-trending] Nothing found this window — leaving the previous run's data as-is.");
    return;
  }

  const runId = await getOrCreateRun(cadence, today);

  const inserted = await db
    .insert(githubTrendingRepos)
    .values(
      merged.map((r) => ({
        runId,
        fullName: r.fullName,
        url: r.url,
        description: r.description,
        stars: r.stars,
        language: r.language,
        matchedTopics: [...r.matchedTopics],
        topicGroups: [...r.topicGroups],
        repoCreatedAt: r.repoCreatedAt,
      })),
    )
    .onConflictDoNothing({ target: [githubTrendingRepos.runId, githubTrendingRepos.url] })
    .returning({ id: githubTrendingRepos.id });

  console.log(`[github-trending] Inserted ${inserted.length} repo(s) for ${cadence} run ${today}.`);
}

main()
  .then(() => {
    console.log("[github-trending] Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[github-trending] Fatal error:", err);
    process.exit(1);
  });
