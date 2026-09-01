import { db, isDatabaseConfigured } from "@/lib/db";
import { trendDigests, trendItems } from "@/lib/db/schema";
import type { TrendCategory } from "@/lib/db/schema";
import { desc, inArray } from "drizzle-orm";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { GithubTrendingSection } from "@/components/github-trending-section";
import { generateTodaysSummaryAction } from "./actions";
import { MODELS, DEFAULT_MODEL_ID } from "@/lib/ai/models";
import { PendingFormButton } from "@/components/pending-form-button";

export const dynamic = "force-dynamic";
// generateTodaysSummaryAction (trends/actions.ts) makes a generateObject
// call that can run long against the local model chain — same reasoning as
// the assistant/classroom pages: a Server Action's Vercel Function duration
// is supposed to inherit from the invoking page's route segment config, but
// that alone has proven unreliable for Server Actions specifically (see
// vercel.json's matching "src/app/trends/**" entry, added as the same
// platform-level backstop used there after a documented production
// incident where the page-level export alone wasn't enough).
// Reverted 500 -> 300 on 2026-09-01: pushes stopped producing any Vercel
// deployment at all (not a failed build with logs — no deployment showed up),
// consistent with the warning above: 500 only works with Fluid Compute
// enabled on this project, which isn't confirmed on. 300 is the hard ceiling
// on Hobby and the safe default on Pro without Fluid Compute. If Fluid
// Compute is verified on (Project Settings -> Functions) this can go back up.
export const maxDuration = 300;

// How many days of digests to show — the daily fetch (see
// .github/workflows/fetch-trends.yml / scripts/fetch-trends.ts) keeps
// writing new rows forever, so this page only ever loads a recent window
// rather than the whole table.
const DAYS_SHOWN = 14;

const CATEGORY_ORDER: TrendCategory[] = ["news", "paper", "repo"];

/** digest.date is a plain "YYYY-MM-DD" day-key (see the column comment in
 *  schema.ts) — parsed at noon UTC so formatting in any real-world
 *  timezone can't shift it into the adjacent calendar day. */
function formatDigestDate(dateKey: string, locale?: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString(locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Falls back to the English field when the Chinese one is empty — covers
// both older digests written before bilingual generation existed and any
// single day where the translation half of the AI call happened to fail
// (see fetch-trends.ts's writeDailyOverview/summarizeItemBilingual: the
// English field is never allowed to be empty if generation succeeded at
// all, only the zh half can silently come back blank).
function pick(isZh: boolean, en: string, zh: string): string {
  return isZh && zh ? zh : en;
}
function pickList(isZh: boolean, en: string[], zh: string[]): string[] {
  return isZh && zh.length > 0 ? zh : en;
}

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: langParam } = await searchParams;
  const lang = await getLang(langParam);
  const s = t(lang).trends;
  const dateLocale = lang === "zh" ? "zh-CN" : undefined;

  const categoryLabel: Record<TrendCategory, string> = {
    news: s.categoryNews,
    paper: s.categoryPaper,
    repo: s.categoryRepo,
  };
  const isZh = lang === "zh";

  if (!isDatabaseConfigured) {
    return (
      <div className="rounded-lg border border-border bg-bg-elevated p-5 text-fg-secondary">
        <p className="font-medium text-fg">{s.dbNotConfigured}</p>
        <p className="mt-1 text-sm">{s.dbNotConfiguredHint}</p>
      </div>
    );
  }

  let digests: (typeof trendDigests.$inferSelect)[] = [];
  const itemsByDigest = new Map<number, (typeof trendItems.$inferSelect)[]>();
  let loadError = false;

  try {
    digests = await db
      .select()
      .from(trendDigests)
      .orderBy(desc(trendDigests.date))
      .limit(DAYS_SHOWN);

    if (digests.length > 0) {
      const digestIds = digests.map((d) => d.id);
      const rows = await db
        .select()
        .from(trendItems)
        .where(inArray(trendItems.digestId, digestIds))
        .orderBy(desc(trendItems.publishedAt));

      for (const row of rows) {
        const list = itemsByDigest.get(row.digestId) ?? [];
        list.push(row);
        itemsByDigest.set(row.digestId, list);
      }
    }
  } catch (err) {
    console.error("Failed to load trends:", err);
    loadError = true;
  }

  // The newest digest's overview gets a featured spot at the very top of
  // the page (see below) rather than making readers scroll to the first
  // day-card to find it — the day-by-day loop skips re-rendering this same
  // content for that one digest so it isn't shown twice.
  const latestDigest = digests[0];

  return (
    <div className="flex w-full flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold text-fg">{s.title}</h1>
        <p className="mt-1 text-fg-secondary">{s.description}</p>
      </div>

      {/* Always rendered — previously this box only appeared once the
          daily cron had already written a summary, which meant a fresh
          deploy (or a day the cron hasn't run yet) showed nothing here at
          all with no way to fix that from the page itself. The
          generate/refresh form works off whatever news/GitHub items are
          already in the DB right now, independent of the cron's schedule. */}
      <section className="flex flex-col gap-4 rounded-2xl border border-accent/40 bg-accent/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-fg">{s.latestSummaryTitle}</h2>
          <form action={generateTodaysSummaryAction} className="flex flex-wrap items-center gap-2">
            <select
              name="modelId"
              defaultValue={DEFAULT_MODEL_ID}
              aria-label={s.modelLabel}
              className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm text-fg outline-none focus:border-accent"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.isFree ? "" : " 💲"}
                </option>
              ))}
            </select>
            <PendingFormButton
              label={
                latestDigest?.summaryMarkdown || latestDigest?.insight
                  ? `↻ ${s.refreshSummary}`
                  : `✨ ${s.generateSummary}`
              }
              pendingLabel={s.generatingSummary}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:opacity-60 transition-opacity"
            />
          </form>
        </div>

        {latestDigest?.summaryMarkdown || latestDigest?.insight ? (
          <>
            {latestDigest.summaryMarkdown && (
              <p className="max-w-3xl leading-relaxed text-fg">
                {pick(isZh, latestDigest.summaryMarkdown, latestDigest.summaryMarkdownZh)}
              </p>
            )}

            {latestDigest.insight && (
              <div className="max-w-3xl">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">
                  {s.insightLabel}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-fg-secondary">
                  {pick(isZh, latestDigest.insight, latestDigest.insightZh)}
                </p>
              </div>
            )}

            {(latestDigest.actionItems.length > 0 || latestDigest.watchList.length > 0) && (
              <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
                {latestDigest.actionItems.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">
                      {s.actionItemsLabel}
                    </h3>
                    <ul className="flex flex-col gap-1 text-sm text-fg-secondary">
                      {pickList(isZh, latestDigest.actionItems, latestDigest.actionItemsZh).map((it, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-accent">→</span>
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {latestDigest.watchList.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">
                      {s.watchListLabel}
                    </h3>
                    <ul className="flex flex-col gap-1 text-sm text-fg-secondary">
                      {pickList(isZh, latestDigest.watchList, latestDigest.watchListZh).map((it, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-accent">•</span>
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="max-w-3xl text-sm text-fg-secondary">{s.noSummaryYet}</p>
        )}
      </section>

      {/* Independent data source from the digests below (its own
          github_trending_runs/repos/developers tables, populated by the
          fetch-github-trending-{daily,weekly,monthly}.yml workflows) —
          placed ahead of the daily news digests per the owner's preferred
          reading order (repos/tooling activity first, news second). */}
      <GithubTrendingSection lang={lang} />

      {loadError && (
        <div className="rounded-lg border border-danger/40 bg-bg-elevated p-5 text-fg-secondary">
          <p className="font-medium text-fg">{s.loadFailed}</p>
          <p className="mt-1 text-sm">{s.reload}</p>
        </div>
      )}

      {!loadError && digests.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-sm text-fg-secondary">
          {s.empty}
        </div>
      )}

      {digests.map((digest) => {
        const items = itemsByDigest.get(digest.id) ?? [];
        // The newest digest's summary/insight/action-items/watch-list are
        // already featured in the hero section above — skip repeating them
        // here so they don't appear twice on the page. Its item cards
        // still render below like every other day.
        const isLatest = digest.id === latestDigest?.id;
        return (
          <section key={digest.id} className="flex flex-col gap-4 border-b border-border pb-8 last:border-b-0">
            <h2 className="text-lg font-semibold text-fg">{formatDigestDate(digest.date, dateLocale)}</h2>
            {!isLatest && digest.summaryMarkdown && (
              <p className="max-w-3xl leading-relaxed text-fg-secondary">
                {pick(isZh, digest.summaryMarkdown, digest.summaryMarkdownZh)}
              </p>
            )}

            {!isLatest && digest.insight && (
              <div className="max-w-3xl rounded-lg border border-accent/30 bg-accent/5 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">
                  {s.insightLabel}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-fg-secondary">
                  {pick(isZh, digest.insight, digest.insightZh)}
                </p>
              </div>
            )}

            {!isLatest && (digest.actionItems.length > 0 || digest.watchList.length > 0) && (
              <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
                {digest.actionItems.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">
                      {s.actionItemsLabel}
                    </h3>
                    <ul className="flex flex-col gap-1 text-sm text-fg-secondary">
                      {pickList(isZh, digest.actionItems, digest.actionItemsZh).map((it, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-accent">→</span>
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {digest.watchList.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">
                      {s.watchListLabel}
                    </h3>
                    <ul className="flex flex-col gap-1 text-sm text-fg-secondary">
                      {pickList(isZh, digest.watchList, digest.watchListZh).map((it, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-accent">•</span>
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {/* Full-width per category rather than a fixed 3-column split —
                a fixed split meant a day with only "News" populated (the
                common case; see the AI News/arXiv reliability notes on
                fetch-trends.ts) rendered as one narrow column using a third
                of the page. Each category's own item list is instead a
                responsive card grid, so News alone spans the full width in
                up to 3 columns left-to-right. */}
            <div className="flex flex-col gap-6">
              {CATEGORY_ORDER.map((category) => {
                const categoryItems = items.filter((i) => i.category === category);
                if (categoryItems.length === 0) return null;
                return (
                  <div key={category} className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">
                      {categoryLabel[category]}
                    </h3>
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {categoryItems.map((item) => (
                        <li
                          key={item.id}
                          className="flex flex-col rounded-lg border border-border bg-bg-elevated p-3"
                        >
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium text-fg hover:text-accent transition-colors"
                          >
                            {item.title}
                          </a>
                          <div className="mt-1 text-xs text-fg-secondary">{item.source}</div>
                          {item.summary && (
                            <p className="mt-1.5 text-xs leading-relaxed text-fg-secondary">
                              {pick(isZh, item.summary, item.summaryZh)}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
