// GitHub Trending snapshot — the REAL https://github.com/trending page
// (repositories) and https://github.com/trending/developers, scraped once
// per cadence (daily/weekly/monthly) by
// .github/workflows/fetch-github-trending-{daily,weekly,monthly}.yml, each
// setting TRENDING_CADENCE before calling this script.
//
// Why scraping instead of the Search API: GitHub has no "trending" API at
// all, and no API for "trending developers" specifically — this was
// previously approximated via Search (recently-created repos ranked by
// stars), which can't represent developer trending and isn't what GitHub
// itself would call trending. This pulls the actual page instead.
//
// Fragility trade-off, on purpose: scraping HTML means this can silently
// break if GitHub changes the page's markup. The parser below leans on
// selectors/URL-shape that have been stable for years (the owner/repo vs.
// single-username path shape in particular is GitHub's actual routing
// contract, not a styling class, so it's about as durable as scraping gets)
// and degrades to "0 parsed" + a loud console warning rather than throwing,
// so a future breakage shows up as an empty run in the Action log instead
// of a silent one.
//
// Same cadence-window semantics as GitHub's own page: `since=daily` means
// "today", `since=weekly` means "this week", `since=monthly` means "this
// month" — passed straight through since our TrendingCadence values already
// match GitHub's own query param values.
//
// Run locally with:
//   TRENDING_CADENCE=daily npx tsx scripts/fetch-github-trending.ts
// (needs DATABASE_URL in the environment.)
import { parseHTML } from "linkedom";
import { and, eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  githubTrendingRuns,
  githubTrendingRepos,
  githubTrendingDevelopers,
  type TrendingCadence,
} from "../src/lib/db/schema";

const USER_AGENT = "Mozilla/5.0 (compatible; brainbank/1.0; +https://github.com/icetonges/brainbank)";

interface ScrapedRepo {
  rank: number;
  fullName: string;
  url: string;
  description: string;
  language: string | null;
  stars: number;
  forks: number;
  starsInPeriod: number;
}

interface ScrapedDeveloper {
  rank: number;
  username: string;
  displayName: string;
  profileUrl: string;
  avatarUrl: string;
  popularRepoName: string | null;
  popularRepoUrl: string | null;
  popularRepoDescription: string | null;
}

function parseCadence(): TrendingCadence {
  const raw = process.env.TRENDING_CADENCE;
  if (raw === "daily" || raw === "weekly" || raw === "monthly") return raw;
  throw new Error(
    `TRENDING_CADENCE must be one of "daily"/"weekly"/"monthly" — got ${JSON.stringify(raw)}.`,
  );
}

function parseCount(text: string | null | undefined): number {
  if (!text) return 0;
  const digits = text.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// Each trending repo row is wrapped in an <article> — falls back to
// .Box-row if GitHub ever drops that wrapper, since the row-per-item
// structure itself is older/more load-bearing than the tag choice.
function scrapeRepos(html: string): ScrapedRepo[] {
  const { document } = parseHTML(html);
  // Typed as Element[] (not the querySelectorAll("article") overload's
  // inferred HTMLElement[]) since the .Box-row fallback below returns the
  // untagged Element[] — Vercel's `next build` type-checks this file too and
  // HTMLElement[] isn't assignable from Element[].
  let rows: Element[] = [...document.querySelectorAll("article")];
  if (rows.length === 0) rows = [...document.querySelectorAll(".Box-row")];

  const repos: ScrapedRepo[] = [];

  for (const row of rows) {
    try {
      const heading = row.querySelector("h2 a[href]");
      const href = heading?.getAttribute("href")?.trim();
      // Must look like /owner/repo — this is what actually distinguishes a
      // repo row from anything else on the page, independent of CSS classes.
      if (!href || !/^\/[^/]+\/[^/]+\/?$/.test(href)) continue;

      const fullName = href.replace(/^\/|\/$/g, "");
      const description =
        row.querySelector("p")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const language =
        row.querySelector('[itemprop="programmingLanguage"]')?.textContent?.trim() || null;

      // The stars/forks counters are just the two numeric-text links in the
      // row, in that order — robust to class renames.
      const numberLinks = [...row.querySelectorAll("a")]
        .map((a) => a.textContent?.replace(/\s+/g, " ").trim() ?? "")
        .filter((text) => /^[\d,]+$/.test(text));

      const rowText = row.textContent?.replace(/\s+/g, " ") ?? "";
      const periodMatch = rowText.match(/([\d,]+)\s+stars?\s+(today|this week|this month)/i);

      repos.push({
        rank: repos.length + 1,
        fullName,
        url: `https://github.com${href.replace(/\/$/, "")}`,
        description,
        language,
        stars: parseCount(numberLinks[0]),
        forks: parseCount(numberLinks[1]),
        starsInPeriod: periodMatch ? parseCount(periodMatch[1]) : 0,
      });
    } catch (err) {
      console.warn("[github-trending] Skipped one repo row that failed to parse:", err);
    }
  }

  return repos;
}

// The developers page has no owner/repo-shaped link to key off of for the
// row itself — instead each row's *profile* link is a bare /username path
// (exactly one segment), which is just as durable a signal since it's
// GitHub's real routing shape, not a style hook.
function scrapeDevelopers(html: string): ScrapedDeveloper[] {
  const { document } = parseHTML(html);
  let rows: Element[] = [...document.querySelectorAll("article")];
  if (rows.length === 0) rows = [...document.querySelectorAll(".Box-row")];

  const developers: ScrapedDeveloper[] = [];

  for (const row of rows) {
    try {
      const links = [...row.querySelectorAll("a[href]")];
      const profileLink = links.find((a) => {
        const href = a.getAttribute("href");
        return href && /^\/[^/]+\/?$/.test(href);
      });
      const profileHref = profileLink?.getAttribute("href");
      if (!profileHref) continue;

      const username = profileHref.replace(/^\/|\/$/g, "");
      if (!username) continue;

      const avatarUrl = row.querySelector("img")?.getAttribute("src") ?? "";
      const displayName =
        row.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || username;

      const repoLink = links.find((a) => {
        const href = a.getAttribute("href");
        return href && /^\/[^/]+\/[^/]+\/?$/.test(href);
      });
      const repoHref = repoLink?.getAttribute("href") ?? null;
      const repoArticle = repoLink?.closest("article") ?? null;
      const popularRepoDescription =
        repoArticle?.querySelector("p, div")?.textContent?.replace(/\s+/g, " ").trim() || null;

      developers.push({
        rank: developers.length + 1,
        username,
        displayName,
        profileUrl: `https://github.com/${username}`,
        avatarUrl,
        popularRepoName: repoHref ? repoHref.replace(/^\/|\/$/g, "") : null,
        popularRepoUrl: repoHref ? `https://github.com${repoHref.replace(/\/$/, "")}` : null,
        popularRepoDescription,
      });
    } catch (err) {
      console.warn("[github-trending] Skipped one developer row that failed to parse:", err);
    }
  }

  return developers;
}

async function getOrCreateRun(cadence: TrendingCadence, date: string): Promise<number> {
  const [existing] = await db
    .select({ id: githubTrendingRuns.id })
    .from(githubTrendingRuns)
    .where(and(eq(githubTrendingRuns.cadence, cadence), eq(githubTrendingRuns.date, date)));
  if (existing) {
    // Re-running the same day (e.g. a manual workflow_dispatch) replaces
    // that day's rows rather than piling up duplicates.
    await db.delete(githubTrendingRepos).where(eq(githubTrendingRepos.runId, existing.id));
    await db.delete(githubTrendingDevelopers).where(eq(githubTrendingDevelopers.runId, existing.id));
    return existing.id;
  }
  const [created] = await db.insert(githubTrendingRuns).values({ cadence, date }).returning();
  return created.id;
}

async function main() {
  const cadence = parseCadence();
  const today = new Date().toISOString().slice(0, 10);

  console.log(`[github-trending] cadence=${cadence}`);

  let repos: ScrapedRepo[] = [];
  let developers: ScrapedDeveloper[] = [];

  try {
    const html = await fetchHtml(`https://github.com/trending?since=${cadence}`);
    repos = scrapeRepos(html);
    console.log(`[github-trending] Parsed ${repos.length} repo(s).`);
    if (repos.length === 0) {
      console.warn(
        "[github-trending] 0 repos parsed from a 200 response — GitHub's markup may have changed. Leaving previous data as-is for this cadence.",
      );
    }
  } catch (err) {
    console.error("[github-trending] Failed to fetch trending repos:", err);
  }

  try {
    const html = await fetchHtml(`https://github.com/trending/developers?since=${cadence}`);
    developers = scrapeDevelopers(html);
    console.log(`[github-trending] Parsed ${developers.length} developer(s).`);
    if (developers.length === 0) {
      console.warn(
        "[github-trending] 0 developers parsed from a 200 response — GitHub's markup may have changed. Leaving previous data as-is for this cadence.",
      );
    }
  } catch (err) {
    console.error("[github-trending] Failed to fetch trending developers:", err);
  }

  if (repos.length === 0 && developers.length === 0) {
    console.log("[github-trending] Nothing parsed at all — exiting without touching the DB.");
    return;
  }

  const runId = await getOrCreateRun(cadence, today);

  if (repos.length > 0) {
    const insertedRepos = await db
      .insert(githubTrendingRepos)
      .values(repos.map((r) => ({ runId, ...r })))
      .onConflictDoNothing({ target: [githubTrendingRepos.runId, githubTrendingRepos.url] })
      .returning({ id: githubTrendingRepos.id });
    console.log(`[github-trending] Inserted ${insertedRepos.length} repo row(s).`);
  }

  if (developers.length > 0) {
    const insertedDevs = await db
      .insert(githubTrendingDevelopers)
      .values(developers.map((d) => ({ runId, ...d })))
      .onConflictDoNothing({
        target: [githubTrendingDevelopers.runId, githubTrendingDevelopers.username],
      })
      .returning({ id: githubTrendingDevelopers.id });
    console.log(`[github-trending] Inserted ${insertedDevs.length} developer row(s).`);
  }
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
