import { db, isDatabaseConfigured } from "@/lib/db";
import { trendDigests, trendItems } from "@/lib/db/schema";
import type { TrendCategory } from "@/lib/db/schema";
import { desc, inArray } from "drizzle-orm";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

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

  return (
    <div className="flex w-full flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold text-fg">{s.title}</h1>
        <p className="mt-1 text-fg-secondary">{s.description}</p>
      </div>

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
        return (
          <section key={digest.id} className="flex flex-col gap-4 border-b border-border pb-8 last:border-b-0">
            <h2 className="text-lg font-semibold text-fg">{formatDigestDate(digest.date, dateLocale)}</h2>
            {digest.summaryMarkdown && (
              <p className="max-w-3xl leading-relaxed text-fg-secondary">{digest.summaryMarkdown}</p>
            )}
            <div className="grid gap-4 md:grid-cols-3">
              {CATEGORY_ORDER.map((category) => {
                const categoryItems = items.filter((i) => i.category === category);
                if (categoryItems.length === 0) return null;
                return (
                  <div key={category} className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">
                      {categoryLabel[category]}
                    </h3>
                    <ul className="flex flex-col gap-3">
                      {categoryItems.map((item) => (
                        <li key={item.id} className="rounded-lg border border-border bg-bg-elevated p-3">
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
                            <p className="mt-1.5 text-xs leading-relaxed text-fg-secondary">{item.summary}</p>
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
