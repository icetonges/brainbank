import Link from "next/link";
import { db } from "@/lib/db";
import { notes, noteContent, classroomSubcategories, classroomSections } from "@/lib/db/schema";
import type { ClassroomCategory } from "@/lib/db/schema";
import { auth } from "@/auth";
import { CLASSROOM_TABS, isClassroomCategory } from "@/lib/classroom";
import { getLang } from "@/lib/i18n-server";
import { t, CLASSROOM_TAB_LABELS_ZH } from "@/lib/i18n";
import { eq, and, asc, desc, isNotNull } from "drizzle-orm";
import { formatDateTime } from "@/lib/date";

export const dynamic = "force-dynamic";

/* Rotating tones for the section blocks inside a subcategory card —
 * structure you can see at a glance: each section gets its own hue
 * (left bar, label, tinted header) so "My app" vs "GitHub" under
 * "Resources" read as clearly separate shelves, not one long list.
 * Tailwind needs literal class strings, hence the lookup table. */
const SECTION_TONES = [
  { bar: "border-l-info", text: "text-info", tint: "bg-info/10", dot: "bg-info" },
  { bar: "border-l-success", text: "text-success", tint: "bg-success/10", dot: "bg-success" },
  { bar: "border-l-warn", text: "text-warn", tint: "bg-warn/10", dot: "bg-warn" },
  { bar: "border-l-accent", text: "text-accent", tint: "bg-accent/10", dot: "bg-accent" },
] as const;

function ArticleRow({
  article,
  lang,
  dateLocale,
}: {
  article: ArticleItem;
  lang: string;
  dateLocale?: string;
}) {
  return (
    <li>
      <Link
        href={`/classroom/${article.slug}?lang=${lang}`}
        className="group flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-bg"
      >
        <span className="line-clamp-1 text-fg transition-colors group-hover:text-accent">
          {article.title}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-fg-secondary">
          {article.status !== "published" && (
            <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-semibold text-warn">
              {article.status}
            </span>
          )}
          {formatDateTime(article.createdAt, dateLocale)}
          <Chevron />
        </span>
      </Link>
    </li>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}

interface ArticleItem {
  slug: string;
  title: string;
  createdAt: Date;
  status: string;
}

interface SectionGroup {
  id: number;
  name: string;
  articles: ArticleItem[];
}

interface SubcategoryGroup {
  id: number;
  name: string;
  slug: string;
  sections: SectionGroup[];
  unsectioned: ArticleItem[];
}

export default async function ClassroomPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; lang?: string }>;
}) {
  const { tab, lang: langParam } = await searchParams;
  // "all" is the default landing state — a synthetic tab (not part of the
  // ClassroomCategory enum) that shows articles across every subtab.
  const activeTab: ClassroomCategory | "all" =
    tab && isClassroomCategory(tab) ? tab : "all";

  const session = await auth();
  const lang = await getLang(langParam);
  const s = t(lang).classroom;
  const dateLocale = lang === "zh" ? "zh-CN" : undefined;

  // Articles are organized the same way the AI Classroom files them:
  // subcategory (e.g. "Claude Code Deep Dive") -> section within that
  // subcategory (e.g. "Quick Start") -> article. Articles with no
  // subcategory land in an "Uncategorized" bucket at the end; articles with
  // a subcategory but no section land in that subcategory's "more articles"
  // catch-all.
  let subcategoryGroups: SubcategoryGroup[] = [];
  let uncategorized: ArticleItem[] = [];
  let loadError = false;

  try {
    // notes.title is always the *original* language's title — the site
    // defaults to English, so a Chinese-original article needs its "en"
    // note_content title instead (publishing now auto-translates Chinese
    // articles to English; older articles without one just fall back to
    // their original title).
    const rows = await db
      .select({
        slug: notes.slug,
        title: notes.title,
        translatedTitle: noteContent.title,
        primaryLanguage: notes.primaryLanguage,
        createdAt: notes.createdAt,
        status: notes.status,
        subcategoryId: notes.subcategoryId,
        subcategoryName: classroomSubcategories.name,
        subcategorySlug: classroomSubcategories.slug,
        sectionId: notes.sectionId,
        sectionName: classroomSections.name,
      })
      .from(notes)
      .leftJoin(classroomSubcategories, eq(notes.subcategoryId, classroomSubcategories.id))
      .leftJoin(classroomSections, eq(notes.sectionId, classroomSections.id))
      .leftJoin(noteContent, and(eq(noteContent.noteId, notes.id), eq(noteContent.language, lang)))
      .where(activeTab === "all" ? isNotNull(notes.category) : eq(notes.category, activeTab))
      .orderBy(
        asc(classroomSubcategories.name),
        asc(classroomSections.sortOrder),
        asc(classroomSections.name),
        asc(notes.sectionOrder),
        desc(notes.createdAt),
      );

    // Public-read/private-edit, same as regular notes: anonymous visitors
    // only see published articles; the owner sees drafts/private too.
    const visibleRows = session ? rows : rows.filter((r) => r.status === "published");

    const subcatMap = new Map<number, SubcategoryGroup>();

    for (const r of visibleRows) {
      const article: ArticleItem = {
        slug: r.slug,
        title: lang === r.primaryLanguage ? r.title : r.translatedTitle || r.title,
        createdAt: r.createdAt,
        status: r.status,
      };

      if (r.subcategoryId == null || r.subcategoryName == null || r.subcategorySlug == null) {
        uncategorized.push(article);
        continue;
      }

      let group = subcatMap.get(r.subcategoryId);
      if (!group) {
        group = {
          id: r.subcategoryId,
          name: r.subcategoryName,
          slug: r.subcategorySlug,
          sections: [],
          unsectioned: [],
        };
        subcatMap.set(r.subcategoryId, group);
      }

      if (r.sectionId == null || r.sectionName == null) {
        group.unsectioned.push(article);
      } else {
        let section = group.sections.find((sec) => sec.id === r.sectionId);
        if (!section) {
          section = { id: r.sectionId, name: r.sectionName, articles: [] };
          group.sections.push(section);
        }
        section.articles.push(article);
      }
    }

    subcategoryGroups = Array.from(subcatMap.values());
  } catch (err) {
    console.error("Failed to load classroom articles:", err);
    loadError = true;
  }

  const isEmpty = subcategoryGroups.length === 0 && uncategorized.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-fg">{s.title}</h1>
          <p className="mt-1 text-fg-secondary">{s.description}</p>
        </div>
        {session && (
          <Link
            href="/classroom/new"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 transition-opacity"
          >
            {s.newArticle}
          </Link>
        )}
      </div>

      {/* Pill tabs — the active subtab is a solid accent chip instead of a
          thin underline, so where you are is visible at a glance. */}
      <nav className="flex flex-wrap gap-2">
        <Link
          href={`/classroom?tab=all&lang=${lang}`}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "all"
              ? "bg-accent text-accent-fg"
              : "border border-border text-fg-secondary hover:border-accent hover:text-accent"
          }`}
        >
          {s.allTab}
        </Link>
        {CLASSROOM_TABS.map(({ value, label }) => {
          const active = value === activeTab;
          return (
            <Link
              key={value}
              href={`/classroom?tab=${value}&lang=${lang}`}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-accent text-accent-fg"
                  : "border border-border text-fg-secondary hover:border-accent hover:text-accent"
              }`}
            >
              {lang === "zh" ? CLASSROOM_TAB_LABELS_ZH[value] : label}
            </Link>
          );
        })}
      </nav>

      {loadError ? (
        <div className="rounded-lg border border-danger/40 bg-bg-elevated p-5 text-fg-secondary">
          <p className="font-medium text-fg">{s.loadFailed}</p>
          <p className="mt-1 text-sm">{s.reload}</p>
        </div>
      ) : isEmpty ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-fg-secondary">
          <p>{s.emptyTab}</p>
          {session && (
            <p className="mt-1 text-sm">
              <Link href="/classroom/new" className="text-accent hover:underline">
                {s.createFirstArticle}
              </Link>{" "}
              {s.autoFiled}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {subcategoryGroups.map((group) => {
            const total =
              group.sections.reduce((n, sec) => n + sec.articles.length, 0) + group.unsectioned.length;
            return (
              /* One card per subcategory: a tinted header band with a
                 letter tile makes each group a visually distinct "shelf",
                 and its sections render as colored blocks inside — the
                 hierarchy (subcategory > section > article) is visible
                 without reading a word. */
              <section
                key={group.id}
                className="overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-sm"
              >
                <Link
                  href={`/${group.slug}?lang=${lang}`}
                  className="group flex items-center gap-3 border-b border-border bg-gradient-to-r from-accent/15 via-accent/5 to-transparent px-5 py-4 transition-colors hover:from-accent/25"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-lg font-bold text-accent-fg">
                    {group.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-lg font-semibold text-fg transition-colors group-hover:text-accent">
                    {group.name}
                  </span>
                  <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
                    {total}
                  </span>
                </Link>

                <div className="flex flex-col gap-4 p-4 sm:p-5">
                  {group.sections.map((sec, i) => {
                    const tone = SECTION_TONES[i % SECTION_TONES.length];
                    return (
                      <div
                        key={sec.id}
                        className={`overflow-hidden rounded-xl border border-border border-l-4 ${tone.bar}`}
                      >
                        <h3
                          className={`flex items-center gap-2 ${tone.tint} px-4 py-2 text-sm font-semibold ${tone.text}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
                          {sec.name}
                          <span className="ml-auto text-xs font-normal opacity-80">
                            {sec.articles.length}
                          </span>
                        </h3>
                        <ul className="flex flex-col divide-y divide-border">
                          {sec.articles.map((a) => (
                            <ArticleRow key={a.slug} article={a} lang={lang} dateLocale={dateLocale} />
                          ))}
                        </ul>
                      </div>
                    );
                  })}

                  {group.unsectioned.length > 0 && (
                    <div className="overflow-hidden rounded-xl border border-border">
                      {group.sections.length > 0 && (
                        <h3 className="flex items-center gap-2 bg-bg px-4 py-2 text-sm font-semibold text-fg-secondary">
                          <span className="h-1.5 w-1.5 rounded-full bg-fg-secondary/60" aria-hidden />
                          {s.moreArticles}
                          <span className="ml-auto text-xs font-normal opacity-80">
                            {group.unsectioned.length}
                          </span>
                        </h3>
                      )}
                      <ul className="flex flex-col divide-y divide-border">
                        {group.unsectioned.map((a) => (
                          <ArticleRow key={a.slug} article={a} lang={lang} dateLocale={dateLocale} />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            );
          })}

          {uncategorized.length > 0 && (
            <div className="flex flex-col gap-3">
              {subcategoryGroups.length > 0 && (
                <h2 className="text-lg font-semibold text-fg">{s.uncategorized}</h2>
              )}
              <ul className="grid gap-3 sm:grid-cols-2">
                {uncategorized.map((a) => (
                  <li key={a.slug}>
                    <Link
                      href={`/classroom/${a.slug}?lang=${lang}`}
                      className="group flex h-full flex-col gap-1 rounded-xl border border-border bg-bg-elevated p-4 transition-colors hover:border-accent"
                    >
                      <span className="font-semibold text-fg transition-colors group-hover:text-accent">
                        {a.title}
                      </span>
                      <span className="text-xs text-fg-secondary">
                        {formatDateTime(a.createdAt, dateLocale)}
                        {a.status !== "published" ? ` · ${a.status}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
