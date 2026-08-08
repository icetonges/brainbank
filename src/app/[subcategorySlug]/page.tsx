import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db, isDatabaseConfigured } from "@/lib/db";
import { classroomSubcategories, classroomSections, notes, noteContent } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { SectionArticleList } from "@/components/section-article-list";
import { formatDateTime } from "@/lib/date";
import { sectionTone } from "@/lib/classroom/section-tones";

export const dynamic = "force-dynamic";

interface ArticleRow {
  id: number;
  slug: string;
  title: string;
  createdAt: Date;
  status: string;
  sectionId: number | null;
}

/**
 * A subcategory's own landing page — one per row in classroom_subcategories,
 * addressed by its slug at the top level (e.g. /claudecodedeepdive rather
 * than nested under /classroom) per the requested URL style. Lists every
 * section (classroom_sections) in its configured order, each with its full
 * article list; owners get a drag-to-reorder list (SectionArticleList),
 * everyone else gets the same list read-only. Articles filed under the
 * subcategory but with no section land in a catch-all group at the bottom
 * so nothing silently disappears from the page.
 *
 * Styling deliberately mirrors one "card" from the /classroom overview grid
 * (classroom/page.tsx) — same gradient header band + letter tile + count
 * badge, same per-section color rotation (sectionTone), same ArticleRow
 * look for individual rows — rather than the plain list this page used to
 * be. Drilling into a subcategory should feel like zooming into its card,
 * not landing on a differently-styled page.
 */
export default async function SubcategoryLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ subcategorySlug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  if (!isDatabaseConfigured) notFound();

  const { subcategorySlug } = await params;
  const { lang: langParam } = await searchParams;
  const session = await auth();
  const lang = await getLang(langParam);
  const s = t(lang).classroom;
  const dateLocale = lang === "zh" ? "zh-CN" : undefined;

  const subcategory = await db.query.classroomSubcategories.findFirst({
    where: eq(classroomSubcategories.slug, subcategorySlug),
  });
  if (!subcategory) notFound();

  const sections = await db
    .select({ id: classroomSections.id, name: classroomSections.name })
    .from(classroomSections)
    .where(eq(classroomSections.subcategoryId, subcategory.id))
    .orderBy(asc(classroomSections.sortOrder), asc(classroomSections.name));

  // Public-read/private-edit, same rule as the rest of the AI Classroom:
  // anonymous visitors only see published articles.
  const visible = session ? undefined : eq(notes.status, "published");

  const articleRows = await db
    .select({
      id: notes.id,
      slug: notes.slug,
      title: notes.title,
      translatedTitle: noteContent.title,
      primaryLanguage: notes.primaryLanguage,
      createdAt: notes.createdAt,
      status: notes.status,
      sectionId: notes.sectionId,
    })
    .from(notes)
    .leftJoin(noteContent, and(eq(noteContent.noteId, notes.id), eq(noteContent.language, lang)))
    .where(
      visible
        ? and(eq(notes.subcategoryId, subcategory.id), visible)
        : eq(notes.subcategoryId, subcategory.id),
    )
    .orderBy(asc(notes.sectionOrder), asc(notes.createdAt));

  const articles: ArticleRow[] = articleRows.map((a) => ({
    id: a.id,
    slug: a.slug,
    title: lang === a.primaryLanguage ? a.title : a.translatedTitle || a.title,
    createdAt: a.createdAt,
    status: a.status,
    sectionId: a.sectionId,
  }));

  const bySection = new Map<number, ArticleRow[]>();
  const unsectioned: ArticleRow[] = [];
  for (const a of articles) {
    if (a.sectionId) {
      const arr = bySection.get(a.sectionId) ?? [];
      arr.push(a);
      bySection.set(a.sectionId, arr);
    } else {
      unsectioned.push(a);
    }
  }

  const sectionsWithArticles = sections
    .map((sec) => ({ ...sec, articles: bySection.get(sec.id) ?? [] }))
    .filter((sec) => sec.articles.length > 0);

  const isEmpty = sectionsWithArticles.length === 0 && unsectioned.length === 0;
  const total =
    sectionsWithArticles.reduce((n, sec) => n + sec.articles.length, 0) + unsectioned.length;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/classroom" className="w-fit text-sm text-accent hover:underline">
        ← {s.title}
      </Link>

      {/* Same header band as one card on the /classroom overview grid
          (letter tile + gradient + count badge) — see classroom/page.tsx —
          so this reads as "that card, opened," not a different page. */}
      <div className="flex items-center gap-3 overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-accent/15 via-accent/5 to-transparent px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-lg font-bold text-accent-fg">
          {subcategory.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-xl font-semibold text-fg">
          {subcategory.name}
        </span>
        {!isEmpty && (
          <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
            {total}
          </span>
        )}
      </div>

      {session && !isEmpty && <p className="text-sm text-fg-secondary">{s.dragHint}</p>}

      {isEmpty ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-fg-secondary">
          <p>{s.emptyTab}</p>
        </div>
      ) : (
        <>
          {sectionsWithArticles.length > 1 && (
            <nav className="flex flex-wrap gap-2">
              {sectionsWithArticles.map((sec, i) => {
                const tone = sectionTone(i);
                return (
                  <a
                    key={sec.id}
                    href={`#section-${sec.id}`}
                    className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-fg-secondary transition-colors hover:border-accent hover:text-accent"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
                    {sec.name}
                  </a>
                );
              })}
            </nav>
          )}

          {/* CSS multi-column (masonry-style) rather than CSS grid. Grid's
              row-major auto-placement forces every item in the same
              implicit row to share that row's height — so a 1-article
              section sitting in a row next to a 14-article section leaves a
              huge dead gap in its own column before the next row starts.
              `columns-*` instead flows sections straight down each column
              and lets a short section be immediately followed by the next
              one in that same column, so columns pack tightly regardless of
              how uneven the sections' lengths are. `break-inside-avoid` on
              each card stops a single section from being split across two
              columns. */}
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
            {sectionsWithArticles.map((sec, i) => {
              const tone = sectionTone(i);
              return (
                <section
                  key={sec.id}
                  id={`section-${sec.id}`}
                  className={`mb-4 flex scroll-mt-20 flex-col overflow-hidden rounded-xl border border-border border-l-4 ${tone.bar} break-inside-avoid`}
                >
                  <div
                    className={`flex items-center gap-2 ${tone.tint} px-4 py-2 text-sm font-semibold ${tone.text}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
                    {sec.name}
                    <span className="ml-auto text-xs font-normal opacity-80">
                      {sec.articles.length}
                    </span>
                  </div>
                  <SectionArticleList
                    // Forces a remount when the language toggle changes
                    // `lang` (soft client-side nav keeps this component
                    // instance mounted otherwise) — SectionArticleList
                    // seeds its `items` state from the `articles` prop
                    // once on mount for optimistic drag-reorder, so
                    // without this key it keeps showing the titles from
                    // whichever language it first mounted with until a
                    // full page refresh remounts it.
                    key={`${sec.id}-${lang}`}
                    sectionId={sec.id}
                    subcategorySlug={subcategory.slug}
                    articles={sec.articles.map((a) => ({
                      id: a.id,
                      slug: a.slug,
                      title: a.title,
                      createdAt: a.createdAt.toISOString(),
                      status: a.status,
                    }))}
                    lang={lang}
                    canReorder={Boolean(session)}
                    dateLocale={dateLocale}
                  />
                </section>
              );
            })}

            {unsectioned.length > 0 && (
              <section className="mb-4 flex flex-col overflow-hidden rounded-xl border border-border break-inside-avoid">
                {sectionsWithArticles.length > 0 && (
                  <div className="flex items-center gap-2 bg-bg px-4 py-2 text-sm font-semibold text-fg-secondary">
                    <span className="h-1.5 w-1.5 rounded-full bg-fg-secondary/60" aria-hidden />
                    {s.moreArticles}
                    <span className="ml-auto text-xs font-normal opacity-80">
                      {unsectioned.length}
                    </span>
                  </div>
                )}
                <ul className="flex flex-col divide-y divide-border">
                  {unsectioned.map((a) => (
                    <li key={a.slug}>
                      <Link
                        href={`/classroom/${a.slug}?lang=${lang}`}
                        className="group flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-bg"
                      >
                        <span className="line-clamp-1 text-fg transition-colors group-hover:text-accent">
                          {a.title}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-fg-secondary">
                          {a.status !== "published" && (
                            <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-semibold text-warn">
                              {a.status}
                            </span>
                          )}
                          {formatDateTime(a.createdAt, dateLocale)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
