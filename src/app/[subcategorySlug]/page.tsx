import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db, isDatabaseConfigured } from "@/lib/db";
import { classroomSubcategories, classroomSections, notes, noteContent } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { SectionArticleList } from "@/components/section-article-list";

export const dynamic = "force-dynamic";

interface ArticleRow {
  id: number;
  slug: string;
  title: string;
  createdAt: Date;
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

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/classroom" className="w-fit text-sm text-accent hover:underline">
          ← {s.title}
        </Link>
        <h1 className="text-3xl font-semibold text-fg">{subcategory.name}</h1>
        {session && !isEmpty && <p className="text-sm text-fg-secondary">{s.dragHint}</p>}
      </div>

      {isEmpty ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-fg-secondary">
          <p>{s.emptyTab}</p>
        </div>
      ) : (
        <>
          {sectionsWithArticles.length > 1 && (
            <nav className="flex flex-wrap gap-2">
              {sectionsWithArticles.map((sec) => (
                <a
                  key={sec.id}
                  href={`#section-${sec.id}`}
                  className="rounded-full border border-border px-3 py-1 text-xs text-fg-secondary transition-colors hover:border-accent hover:text-accent"
                >
                  {sec.name}
                </a>
              ))}
            </nav>
          )}

          <div className="flex flex-col gap-6">
            {sectionsWithArticles.map((sec) => (
              <section
                key={sec.id}
                id={`section-${sec.id}`}
                className="scroll-mt-20 overflow-hidden rounded-xl border border-border"
              >
                <div className="flex items-center justify-between gap-2 bg-bg px-4 py-3">
                  <h2 className="font-semibold text-fg">{sec.name}</h2>
                  <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
                    {sec.articles.length}
                  </span>
                </div>
                <SectionArticleList
                  sectionId={sec.id}
                  subcategorySlug={subcategory.slug}
                  articles={sec.articles.map((a) => ({
                    id: a.id,
                    slug: a.slug,
                    title: a.title,
                    createdAt: a.createdAt.toISOString(),
                  }))}
                  lang={lang}
                  canReorder={Boolean(session)}
                  dateLocale={dateLocale}
                />
              </section>
            ))}

            {unsectioned.length > 0 && (
              <section className="overflow-hidden rounded-xl border border-border">
                <div className="flex items-center justify-between gap-2 bg-bg px-4 py-3">
                  <h2 className="font-semibold text-fg">{s.moreArticles}</h2>
                  <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
                    {unsectioned.length}
                  </span>
                </div>
                <ul className="flex flex-col divide-y divide-border bg-bg-elevated">
                  {unsectioned.map((a) => (
                    <li key={a.slug}>
                      <Link
                        href={`/classroom/${a.slug}?lang=${lang}`}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-bg transition-colors"
                      >
                        <span className="line-clamp-1 text-fg-secondary hover:text-accent transition-colors">
                          {a.title}
                        </span>
                        <span className="shrink-0 text-xs text-fg-secondary">
                          {new Date(a.createdAt).toLocaleDateString(dateLocale)}
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
