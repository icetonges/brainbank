import Link from "next/link";
import { auth } from "@/auth";
import { db, isDatabaseConfigured } from "@/lib/db";
import { notes, noteContent, edges, tags, noteTags, classroomSubcategories, classroomSections } from "@/lib/db/schema";
import type { ClassroomCategory } from "@/lib/db/schema";
import { CLASSROOM_TABS } from "@/lib/classroom";
import { getLang } from "@/lib/i18n-server";
import { t, CLASSROOM_TAB_LABELS_ZH, type Lang } from "@/lib/i18n";
import { desc, asc, eq, and, isNotNull, isNull, count } from "drizzle-orm";
import { HeroVisual, PillarIcon } from "@/components/home-visuals";
import { formatDate, formatDateTime } from "@/lib/date";

export const dynamic = "force-dynamic";

interface HomeData {
  stats: { pages: number; articles: number; connections: number; topics: number };
  categoryCounts: Map<ClassroomCategory, number>;
  latestArticles: { slug: string; title: string; category: ClassroomCategory | null; createdAt: Date }[];
  recentNotes: { id: number; slug: string; title: string; status: string; sourceType: string; updatedAt: Date }[];
  topTags: { name: string; uses: number }[];
  subcategoryToc: {
    id: number;
    name: string;
    slug: string;
    total: number;
    sections: { id: number; name: string; articles: { slug: string; title: string; createdAt: Date }[] }[];
    unsectioned: { slug: string; title: string; createdAt: Date }[];
  }[];
}

async function loadHome(
  isOwner: boolean,
  lang: Lang,
): Promise<{ data: HomeData | null; error: "not-configured" | "connection-failed" | null }> {
  if (!isDatabaseConfigured) return { data: null, error: "not-configured" };
  try {
    // Public-read/private-edit: anonymous visitors only see published pages.
    const visible = isOwner ? undefined : eq(notes.status, "published");

    const [pageCount] = await db.select({ n: count() }).from(notes).where(visible);
    const [edgeCount] = await db.select({ n: count() }).from(edges);
    const [tagCount] = await db.select({ n: count() }).from(tags);

    const catRows = await db
      .select({ category: notes.category, n: count() })
      .from(notes)
      .where(visible ? and(isNotNull(notes.category), visible) : isNotNull(notes.category))
      .groupBy(notes.category);
    const categoryCounts = new Map<ClassroomCategory, number>();
    let articles = 0;
    for (const r of catRows) {
      if (r.category) {
        categoryCounts.set(r.category, r.n);
        articles += r.n;
      }
    }

    // notes.title is always the *original* language's title. The site
    // defaults to English, so when an article's original is Chinese we
    // need the "en" note_content row's title instead (publishing a
    // Chinese article now auto-translates to English for exactly this —
    // see publishClassroomArticle) — falling back to the original title
    // for the rare pre-existing article that hasn't been translated yet.
    const latestArticlesRaw = await db
      .select({
        slug: notes.slug,
        title: notes.title,
        translatedTitle: noteContent.title,
        primaryLanguage: notes.primaryLanguage,
        category: notes.category,
        createdAt: notes.createdAt,
      })
      .from(notes)
      .leftJoin(noteContent, and(eq(noteContent.noteId, notes.id), eq(noteContent.language, lang)))
      .where(visible ? and(isNotNull(notes.category), visible) : isNotNull(notes.category))
      .orderBy(desc(notes.createdAt))
      .limit(5);
    const latestArticles = latestArticlesRaw.map((a) => ({
      slug: a.slug,
      title: lang === a.primaryLanguage ? a.title : a.translatedTitle || a.title,
      category: a.category,
      createdAt: a.createdAt,
    }));

    const recentNotes = await db
      .select({
        id: notes.id,
        slug: notes.slug,
        title: notes.title,
        status: notes.status,
        sourceType: notes.sourceType,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .where(visible ? and(isNull(notes.category), visible) : isNull(notes.category))
      .orderBy(desc(notes.updatedAt))
      .limit(8);

    const topTags = await db
      .select({ name: tags.name, uses: count(noteTags.noteId) })
      .from(tags)
      .innerJoin(noteTags, eq(noteTags.tagId, tags.id))
      .groupBy(tags.name)
      .orderBy(desc(count(noteTags.noteId)))
      .limit(16);

    // Subcategory table of contents: every subcategory (alphabetical),
    // broken down into its sections (classroom_sections) in their
    // configured order — the same grouping the subcategory's own landing
    // page (/[subcategorySlug]) already uses — with a trailing catch-all
    // for articles not filed under any section. Oldest-first within each
    // group (matching the landing page's fallback order) so a course-like
    // subcategory (e.g. "Claude Code Deep Dive") reads start-to-finish
    // here instead of showing its newest entry first. One query each for
    // subcategories/sections/articles rather than N+1 per subcategory.
    const subcatList = await db
      .select({
        id: classroomSubcategories.id,
        name: classroomSubcategories.name,
        slug: classroomSubcategories.slug,
      })
      .from(classroomSubcategories)
      .orderBy(classroomSubcategories.name);

    const sectionList = await db
      .select({
        id: classroomSections.id,
        name: classroomSections.name,
        subcategoryId: classroomSections.subcategoryId,
      })
      .from(classroomSections)
      .orderBy(asc(classroomSections.sortOrder), asc(classroomSections.name));

    const subcatArticlesRaw = await db
      .select({
        subcategoryId: notes.subcategoryId,
        sectionId: notes.sectionId,
        slug: notes.slug,
        title: notes.title,
        translatedTitle: noteContent.title,
        primaryLanguage: notes.primaryLanguage,
        createdAt: notes.createdAt,
      })
      .from(notes)
      .leftJoin(noteContent, and(eq(noteContent.noteId, notes.id), eq(noteContent.language, lang)))
      .where(
        visible
          ? and(isNotNull(notes.subcategoryId), visible)
          : isNotNull(notes.subcategoryId),
      )
      .orderBy(asc(notes.sectionOrder), asc(notes.createdAt));

    // Cap per group (section, or the unsectioned catch-all), not per
    // subcategory as a whole — so one heavily-populated section can't crowd
    // every other section out of the preview. The full, uncapped list is
    // always one click away at the subcategory's own landing page.
    const MAX_PER_GROUP = 8;
    type TocArticle = { slug: string; title: string; createdAt: Date };
    const bySubcatGroup = new Map<string, TocArticle[]>(); // key: `${subcategoryId}:${sectionId ?? "none"}`
    const subcatCounts = new Map<number, number>();
    for (const r of subcatArticlesRaw) {
      if (!r.subcategoryId) continue;
      subcatCounts.set(r.subcategoryId, (subcatCounts.get(r.subcategoryId) ?? 0) + 1);
      const key = `${r.subcategoryId}:${r.sectionId ?? "none"}`;
      const arr = bySubcatGroup.get(key) ?? [];
      if (arr.length < MAX_PER_GROUP) {
        arr.push({
          slug: r.slug,
          title: lang === r.primaryLanguage ? r.title : r.translatedTitle || r.title,
          createdAt: r.createdAt,
        });
      }
      bySubcatGroup.set(key, arr);
    }

    const sectionsBySubcat = new Map<number, { id: number; name: string }[]>();
    for (const sec of sectionList) {
      const arr = sectionsBySubcat.get(sec.subcategoryId) ?? [];
      arr.push({ id: sec.id, name: sec.name });
      sectionsBySubcat.set(sec.subcategoryId, arr);
    }

    const subcategoryToc = subcatList
      .map((sc) => {
        const sections = (sectionsBySubcat.get(sc.id) ?? [])
          .map((sec) => ({
            id: sec.id,
            name: sec.name,
            articles: bySubcatGroup.get(`${sc.id}:${sec.id}`) ?? [],
          }))
          .filter((sec) => sec.articles.length > 0);
        return {
          id: sc.id,
          name: sc.name,
          slug: sc.slug,
          total: subcatCounts.get(sc.id) ?? 0,
          sections,
          unsectioned: bySubcatGroup.get(`${sc.id}:none`) ?? [],
        };
      })
      .filter((sc) => sc.sections.length > 0 || sc.unsectioned.length > 0);

    return {
      data: {
        stats: { pages: pageCount.n, articles, connections: edgeCount.n, topics: tagCount.n },
        categoryCounts,
        latestArticles,
        recentNotes,
        topTags,
        subcategoryToc,
      },
      error: null,
    };
  } catch (err) {
    console.error("Failed to load homepage data:", err);
    return { data: null, error: "connection-failed" };
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const session = await auth();
  const { lang: langParam } = await searchParams;
  const lang = await getLang(langParam);
  const { data, error } = await loadHome(Boolean(session), lang);
  const s = t(lang).home;
  const cs = t(lang).classroom;
  const dateLocale = lang === "zh" ? "zh-CN" : undefined;
  const tabLabel = (value: ClassroomCategory, enLabel: string) =>
    lang === "zh" ? CLASSROOM_TAB_LABELS_ZH[value] : enLabel;

  const pillars = [
    { kind: "ai" as const, href: "/classroom", ...s.pillars.ai },
    { kind: "km" as const, href: "/graph", ...s.pillars.km },
    { kind: "cm" as const, href: "/classroom?tab=best-practices", ...s.pillars.cm },
  ];

  return (
    <div className="flex flex-1 flex-col gap-14">
      {/* ---- Hero ---- */}
      <section className="grid items-center gap-10 md:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-5">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
            {s.eyebrow}
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-fg sm:text-5xl">
            {s.heroTitle1}
            <br />
            {s.heroTitle2}
          </h1>
          <p className="max-w-xl text-lg text-fg-secondary">{s.heroLede}</p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="/classroom"
              className="rounded-md bg-accent px-5 py-2.5 font-semibold text-accent-fg hover:opacity-90 transition-opacity"
            >
              {s.ctaClassroom}
            </Link>
            {session ? (
              <Link
                href="/classroom/new"
                className="rounded-md border border-border px-5 py-2.5 font-semibold text-fg hover:border-accent hover:text-accent transition-colors"
              >
                {s.ctaCapture}
              </Link>
            ) : (
              <Link
                href="/search"
                className="rounded-md border border-border px-5 py-2.5 font-semibold text-fg hover:border-accent hover:text-accent transition-colors"
              >
                {s.ctaSearch}
              </Link>
            )}
          </div>

          {data && (
            <dl className="mt-2 grid grid-cols-2 gap-x-8 gap-y-3 border-t border-border pt-4 sm:grid-cols-4">
              <Stat label={s.statPages} value={data.stats.pages} />
              <Stat label={s.statArticles} value={data.stats.articles} />
              <Stat label={s.statConnections} value={data.stats.connections} />
              <Stat label={s.statTopics} value={data.stats.topics} />
            </dl>
          )}
        </div>

        <div className="hidden justify-center md:flex">
          <HeroVisual />
        </div>
      </section>

      {/* ---- DB state banners ---- */}
      {error === "not-configured" && (
        <div className="rounded-lg border border-border bg-bg-elevated p-5 text-fg-secondary">
          <p className="font-medium text-fg">{s.dbNotConfigured}</p>
          <p className="mt-1 text-sm">{s.dbNotConfiguredHint}</p>
        </div>
      )}
      {error === "connection-failed" && (
        <div className="rounded-lg border border-danger/40 bg-bg-elevated p-5 text-fg-secondary">
          <p className="font-medium text-fg">{s.dbFailed}</p>
          <p className="mt-1 text-sm">{s.dbFailedHint}</p>
        </div>
      )}

      {/* ---- Three pillars ---- */}
      <section className="grid gap-4 md:grid-cols-3">
        {pillars.map((p) => (
          <div
            key={p.kind}
            className="flex flex-col gap-3 rounded-xl border border-border bg-bg-elevated p-6"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
              <PillarIcon kind={p.kind} />
            </span>
            <h2 className="text-lg font-semibold text-fg">{p.title}</h2>
            <p className="text-sm leading-relaxed text-fg-secondary">{p.body}</p>
            <Link href={p.href} className="mt-auto text-sm font-medium text-accent hover:underline">
              {p.cta} →
            </Link>
          </div>
        ))}
      </section>

      {/* ---- Category index: subcategory table of contents ---- */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold text-fg">{s.browseByCategory}</h2>
          <Link href="/classroom" className="text-sm text-accent hover:underline">
            {s.allSubtabs}
          </Link>
        </div>
        {data && data.subcategoryToc.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.subcategoryToc.map((sc) => (
              <div key={sc.id} className="overflow-hidden rounded-xl border border-border">
                <Link
                  href={`/${sc.slug}`}
                  className="flex items-center justify-between gap-2 bg-bg px-4 py-3 hover:bg-bg/80 transition-colors"
                >
                  <h3 className="font-semibold text-fg">{sc.name}</h3>
                  <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
                    {lang === "zh"
                      ? `${sc.total} ${s.articleMany}`
                      : `${sc.total} ${sc.total === 1 ? s.articleOne : s.articleMany}`}
                  </span>
                </Link>
                <div className="flex flex-col divide-y divide-border bg-bg-elevated">
                  {sc.sections.map((sec) => (
                    <div key={sec.id}>
                      <p className="px-4 pt-2.5 text-xs font-semibold uppercase tracking-wide text-fg-secondary">
                        {sec.name}
                      </p>
                      <ul className="flex flex-col divide-y divide-border">
                        {sec.articles.map((a) => (
                          <li key={a.slug}>
                            <Link
                              href={`/classroom/${a.slug}?lang=${lang}`}
                              className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-bg transition-colors"
                            >
                              <span className="line-clamp-1 text-fg-secondary hover:text-accent transition-colors">
                                {a.title}
                              </span>
                              <span className="shrink-0 text-xs text-fg-secondary">
                                {formatDate(a.createdAt, dateLocale)}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {sc.unsectioned.length > 0 && (
                    <div>
                      {sc.sections.length > 0 && (
                        <p className="px-4 pt-2.5 text-xs font-semibold uppercase tracking-wide text-fg-secondary">
                          {cs.moreArticles}
                        </p>
                      )}
                      <ul className="flex flex-col divide-y divide-border">
                        {sc.unsectioned.map((a) => (
                          <li key={a.slug}>
                            <Link
                              href={`/classroom/${a.slug}?lang=${lang}`}
                              className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-bg transition-colors"
                            >
                              <span className="line-clamp-1 text-fg-secondary hover:text-accent transition-colors">
                                {a.title}
                              </span>
                              <span className="shrink-0 text-xs text-fg-secondary">
                                {formatDate(a.createdAt, dateLocale)}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPanel>{s.noArticles}</EmptyPanel>
        )}
      </section>

      {/* ---- Latest classroom articles + recent knowledge ---- */}
      <section className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold text-fg">{s.latestClassroom}</h2>
            <Link href="/classroom" className="text-sm text-accent hover:underline">
              {s.viewAll}
            </Link>
          </div>
          {data && data.latestArticles.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-bg-elevated">
              {data.latestArticles.map((a) => (
                <li key={a.slug} className="p-4">
                  <Link
                    href={`/classroom/${a.slug}?lang=${lang}`}
                    className="font-medium text-fg hover:text-accent transition-colors"
                  >
                    {a.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
                    {a.category && (
                      <span className="rounded-full border border-accent/50 px-2 py-0.5 text-accent">
                        {tabLabel(
                          a.category,
                          CLASSROOM_TABS.find((tab) => tab.value === a.category)?.label ?? a.category,
                        )}
                      </span>
                    )}
                    <span>{formatDateTime(a.createdAt, dateLocale)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyPanel>
              {s.noArticles}{" "}
              {session && (
                <Link href="/classroom/new" className="text-accent hover:underline">
                  {s.publishFirst}
                </Link>
              )}
            </EmptyPanel>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold text-fg">{s.recentPages}</h2>
            {session && (
              <Link href="/new" className="text-sm text-accent hover:underline">
                {s.newKnowledgeLink}
              </Link>
            )}
          </div>
          {data && data.recentNotes.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-bg-elevated">
              {data.recentNotes.map((n) => (
                <li key={n.id} className="p-4">
                  <Link
                    href={`/notes/${n.slug}?lang=${lang}`}
                    className="font-medium text-fg hover:text-accent transition-colors"
                  >
                    {n.title}
                  </Link>
                  <div className="mt-1 text-xs text-fg-secondary">
                    {n.status} · {n.sourceType} · {formatDate(n.updatedAt, dateLocale)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyPanel>
              {s.noNotes}{" "}
              {session && (
                <Link href="/new" className="text-accent hover:underline">
                  {s.createFirst}
                </Link>
              )}
            </EmptyPanel>
          )}
        </div>
      </section>

      {/* ---- Topic index ---- */}
      {data && data.topTags.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-fg">{s.topicIndex}</h2>
          <div className="flex flex-wrap gap-2">
            {data.topTags.map((tag) => (
              <Link
                key={tag.name}
                href={`/search?q=${encodeURIComponent(tag.name)}`}
                className="rounded-full border border-border bg-bg-elevated px-3 py-1.5 text-sm text-fg-secondary hover:border-accent hover:text-accent transition-colors"
              >
                #{tag.name}
                <span className="ml-1.5 text-xs opacity-70">{tag.uses}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-fg-secondary">{label}</dt>
      <dd className="text-2xl font-semibold text-accent">{value}</dd>
    </div>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-sm text-fg-secondary">
      {children}
    </div>
  );
}
