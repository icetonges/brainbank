import { db } from "@/lib/db";
import { notes, noteContent, classroomSubcategories, classroomSections } from "@/lib/db/schema";
import { asc, and, eq, isNotNull } from "drizzle-orm";
import type { Lang } from "@/lib/i18n";

export interface TocArticle {
  slug: string;
  title: string;
  createdAt: Date;
}

export interface TocSection {
  id: number;
  name: string;
  articles: TocArticle[];
  /** True count of articles in this section, independent of maxPerGroup —
   * when the homepage preview caps `articles` to stay compact, this is
   * what lets the count badge (and a "+N more" hint) stay accurate
   * instead of silently matching the truncated array length. */
  total: number;
}

export interface TocSubcategory {
  id: number;
  name: string;
  slug: string;
  total: number;
  sections: TocSection[];
  unsectioned: TocArticle[];
  /** True count backing `unsectioned`, same reasoning as TocSection.total. */
  unsectionedTotal: number;
}

/**
 * Every classroom subcategory broken down into its sections
 * (classroom_sections, in their configured order) and articles
 * (oldest-first within each group) — the shared grouping behind the
 * subcategory landing page (/[subcategorySlug]), the homepage's "Browse
 * by Category" preview, and the classroom article page's side nav. One
 * query each for subcategories/sections/articles rather than N+1 per
 * subcategory.
 *
 * `maxPerGroup` caps how many articles are kept per section (or the
 * unsectioned catch-all) — the homepage preview passes a small cap to
 * stay compact; the side nav omits it because a nav you can't actually
 * jump to every article from isn't much of a nav.
 */
export async function loadClassroomToc(
  isOwner: boolean,
  lang: Lang,
  maxPerGroup?: number,
): Promise<TocSubcategory[]> {
  // Public-read/private-edit, same rule as the rest of the AI Classroom.
  const visible = isOwner ? undefined : eq(notes.status, "published");

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

  const articleRows = await db
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
      visible ? and(isNotNull(notes.subcategoryId), visible) : isNotNull(notes.subcategoryId),
    )
    .orderBy(asc(notes.sectionOrder), asc(notes.createdAt));

  const bySubcatGroup = new Map<string, TocArticle[]>(); // key: `${subcategoryId}:${sectionId ?? "none"}`
  const groupCounts = new Map<string, number>(); // same key — true count, uncapped
  const subcatCounts = new Map<number, number>();
  for (const r of articleRows) {
    if (!r.subcategoryId) continue;
    subcatCounts.set(r.subcategoryId, (subcatCounts.get(r.subcategoryId) ?? 0) + 1);
    const key = `${r.subcategoryId}:${r.sectionId ?? "none"}`;
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
    const arr = bySubcatGroup.get(key) ?? [];
    if (maxPerGroup === undefined || arr.length < maxPerGroup) {
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

  return subcatList
    .map((sc) => {
      const sections = (sectionsBySubcat.get(sc.id) ?? [])
        .map((sec) => ({
          id: sec.id,
          name: sec.name,
          articles: bySubcatGroup.get(`${sc.id}:${sec.id}`) ?? [],
          total: groupCounts.get(`${sc.id}:${sec.id}`) ?? 0,
        }))
        .filter((sec) => sec.articles.length > 0);
      return {
        id: sc.id,
        name: sc.name,
        slug: sc.slug,
        total: subcatCounts.get(sc.id) ?? 0,
        sections,
        unsectioned: bySubcatGroup.get(`${sc.id}:none`) ?? [],
        unsectionedTotal: groupCounts.get(`${sc.id}:none`) ?? 0,
      };
    })
    .filter((sc) => sc.sections.length > 0 || sc.unsectioned.length > 0);
}
