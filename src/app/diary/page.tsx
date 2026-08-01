import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { notes, noteContent, diaryEntries, noteTags, tags as tagsTable } from "@/lib/db/schema";
import { auth } from "@/auth";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { formatDateTime } from "@/lib/date";
import { DiaryHeatmap, type HeatmapDay } from "@/components/diary-heatmap";
import { tagColor, lifeArea } from "@/lib/knowledge/taxonomy";

export const dynamic = "force-dynamic";

const MOOD_EMOJI: Record<string, string> = {
  great: "🤩",
  good: "🙂",
  neutral: "😐",
  low: "😕",
  rough: "😣",
};

export default async function DiaryPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; tag?: string; date?: string }>;
}) {
  const { lang: langParam, tag: tagFilter, date: dateFilter } = await searchParams;
  const session = await auth();
  // The diary is owner-only, full stop — no public read like the classroom
  // has. middleware.ts also matches /diary, this is defense in depth.
  if (!session) redirect("/login?callbackUrl=/diary");

  const lang = await getLang(langParam);
  const s = t(lang).diary;
  const dateLocale = lang === "zh" ? "zh-CN" : undefined;

  let rows: {
    slug: string;
    title: string;
    occurredAt: Date;
    mood: string | null;
    energy: number | null;
    distilledAt: Date | null;
    body: string | null;
  }[] = [];
  let heatmap: HeatmapDay[] = [];
  let allTags: { name: string; uses: number }[] = [];
  let loadError = false;

  try {
    const dayStart = dateFilter ? new Date(`${dateFilter}T00:00:00`) : null;
    const dayEnd = dateFilter ? new Date(`${dateFilter}T23:59:59.999`) : null;
    const dateWhere = and(
      dayStart ? gte(diaryEntries.occurredAt, dayStart) : undefined,
      dayEnd ? lte(diaryEntries.occurredAt, dayEnd) : undefined,
    );

    const columns = {
      slug: notes.slug,
      title: notes.title,
      occurredAt: diaryEntries.occurredAt,
      mood: diaryEntries.mood,
      energy: diaryEntries.energy,
      distilledAt: diaryEntries.distilledAt,
      body: noteContent.bodyMarkdown,
    };

    // Two fully-built queries rather than one conditionally-extended
    // builder: adding a join on only one branch gives the two branches
    // different builder types, and the union of those can't be chained
    // through .orderBy()/.limit() without a cast.
    rows = tagFilter
      ? await db
          .select(columns)
          .from(diaryEntries)
          .innerJoin(notes, eq(notes.id, diaryEntries.noteId))
          .leftJoin(
            noteContent,
            and(eq(noteContent.noteId, notes.id), eq(noteContent.language, notes.primaryLanguage)),
          )
          .innerJoin(noteTags, eq(noteTags.noteId, notes.id))
          .innerJoin(tagsTable, eq(tagsTable.id, noteTags.tagId))
          .where(and(eq(tagsTable.name, tagFilter), dateWhere))
          .orderBy(desc(diaryEntries.occurredAt))
          .limit(200)
      : await db
          .select(columns)
          .from(diaryEntries)
          .innerJoin(notes, eq(notes.id, diaryEntries.noteId))
          .leftJoin(
            noteContent,
            and(eq(noteContent.noteId, notes.id), eq(noteContent.language, notes.primaryLanguage)),
          )
          .where(dateWhere)
          .orderBy(desc(diaryEntries.occurredAt))
          .limit(200);

    // Heatmap counts per day, with each day's most-used tag color.
    const dayRows = await db
      .select({
        day: sql<string>`TO_CHAR(${diaryEntries.occurredAt}, 'YYYY-MM-DD')`,
        n: sql<number>`COUNT(*)`,
      })
      .from(diaryEntries)
      .groupBy(sql`TO_CHAR(${diaryEntries.occurredAt}, 'YYYY-MM-DD')`);

    const dayTagRows = await db
      .select({
        day: sql<string>`TO_CHAR(${diaryEntries.occurredAt}, 'YYYY-MM-DD')`,
        name: tagsTable.name,
        n: sql<number>`COUNT(*)`,
      })
      .from(diaryEntries)
      .innerJoin(noteTags, eq(noteTags.noteId, diaryEntries.noteId))
      .innerJoin(tagsTable, eq(tagsTable.id, noteTags.tagId))
      .groupBy(sql`TO_CHAR(${diaryEntries.occurredAt}, 'YYYY-MM-DD')`, tagsTable.name);

    const dominant = new Map<string, { name: string; n: number }>();
    for (const r of dayTagRows) {
      if (!lifeArea(r.name)) continue;
      const cur = dominant.get(r.day);
      if (!cur || Number(r.n) > cur.n) dominant.set(r.day, { name: r.name, n: Number(r.n) });
    }

    heatmap = dayRows.map((d) => ({
      date: d.day,
      count: Number(d.n),
      color: dominant.has(d.day) ? tagColor(dominant.get(d.day)!.name) : undefined,
    }));

    allTags = (
      await db
        .select({ name: tagsTable.name, uses: sql<number>`COUNT(*)` })
        .from(diaryEntries)
        .innerJoin(noteTags, eq(noteTags.noteId, diaryEntries.noteId))
        .innerJoin(tagsTable, eq(tagsTable.id, noteTags.tagId))
        .groupBy(tagsTable.name)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(24)
    ).map((r) => ({ name: r.name, uses: Number(r.uses) }));
  } catch (err) {
    console.error("Failed to load diary:", err);
    loadError = true;
  }

  const totalEntries = heatmap.reduce((n, d) => n + d.count, 0);
  const streak = currentStreak(heatmap);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-fg">{s.title}</h1>
          <p className="mt-1 text-fg-secondary">{s.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/assistant"
            className="rounded-md border border-border px-3 py-2 text-sm font-medium text-fg-secondary hover:border-accent hover:text-accent transition-colors"
          >
            🧠 {s.toAssistant}
          </Link>
          <Link
            href="/diary/new"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 transition-opacity"
          >
            {s.newEntry}
          </Link>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-danger/40 bg-bg-elevated p-5 text-fg-secondary">
          <p className="font-medium text-fg">{s.loadFailed}</p>
          <p className="mt-1 text-sm">{s.reload}</p>
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-bg-elevated p-5">
            <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <Stat value={totalEntries} label={s.statEntries} />
              <Stat value={streak} label={s.statStreak} />
              <Stat value={heatmap.filter((d) => d.count > 0).length} label={s.statDays} />
            </div>
            <DiaryHeatmap days={heatmap} lang={lang} />
          </section>

          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href={`/diary?lang=${lang}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  !tagFilter
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border text-fg-secondary hover:border-accent hover:text-accent"
                }`}
              >
                {s.allTags}
              </Link>
              {allTags.map((tag) => {
                const area = lifeArea(tag.name);
                const active = tagFilter === tag.name;
                return (
                  <Link
                    key={tag.name}
                    href={`/diary?tag=${encodeURIComponent(tag.name)}&lang=${lang}`}
                    style={
                      active
                        ? { backgroundColor: tagColor(tag.name), borderColor: tagColor(tag.name) }
                        : { borderColor: `${tagColor(tag.name)}66` }
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      active ? "text-white" : "text-fg-secondary hover:text-fg"
                    }`}
                  >
                    {area ? `${area.emoji} ${lang === "zh" ? area.labelZh : area.labelEn}` : tag.name}
                    <span className="ml-1.5 opacity-60">{tag.uses}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-fg-secondary">
              <p className="text-lg">{s.empty}</p>
              <Link href="/diary/new" className="mt-2 inline-block text-accent hover:underline">
                {s.writeFirst}
              </Link>
            </div>
          ) : (
            <ol className="flex flex-col">
              {rows.map((entry, i) => {
                const prevDay = i > 0 ? dayKey(rows[i - 1].occurredAt) : null;
                const showDay = dayKey(entry.occurredAt) !== prevDay;
                return (
                  <li key={entry.slug} className="flex gap-4">
                    {/* Timeline rail — a continuous line with a node per
                        entry, so a run of entries reads as one thread. */}
                    <div className="flex w-16 shrink-0 flex-col items-end pt-1">
                      {showDay && (
                        <span className="text-xs font-semibold text-fg">
                          {formatDateTime(entry.occurredAt, dateLocale).split(",")[0]}
                        </span>
                      )}
                      <span className="text-[11px] text-fg-secondary">
                        {entry.occurredAt.toLocaleTimeString(dateLocale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <div className="relative flex flex-col items-center">
                      <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-bg" />
                      <span className="w-px flex-1 bg-border" />
                    </div>

                    <Link
                      href={`/diary/${entry.slug}?lang=${lang}`}
                      className="group mb-3 min-w-0 flex-1 rounded-xl border border-border bg-bg-elevated p-4 transition-colors hover:border-accent"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="font-semibold text-fg transition-colors group-hover:text-accent">
                          {entry.title}
                        </h2>
                        <span className="flex shrink-0 items-center gap-2 text-sm">
                          {entry.mood && <span title={entry.mood}>{MOOD_EMOJI[entry.mood]}</span>}
                          {!entry.distilledAt && (
                            <span
                              title={s.pendingDistill}
                              className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-semibold text-warn"
                            >
                              ⏳
                            </span>
                          )}
                        </span>
                      </div>
                      {entry.body && (
                        <p className="mt-1 line-clamp-2 text-sm text-fg-secondary">
                          {stripMarkdown(entry.body)}
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-2xl font-bold text-fg">{value}</span>
      <span className="text-sm text-fg-secondary">{label}</span>
    </div>
  );
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Consecutive days with at least one entry, counting back from today (or
 *  yesterday — today not being written yet shouldn't break a streak). */
function currentStreak(days: HeatmapDay[]): number {
  const written = new Set(days.filter((d) => d.count > 0).map((d) => d.date));
  const cursor = new Date();
  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  if (!written.has(key(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (written.has(key(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Cheap markdown-to-text for list previews — images, links, and headings
 *  render as noise in a two-line clamp. */
function stripMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
