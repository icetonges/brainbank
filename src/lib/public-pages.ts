import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { loadClassroomToc } from "@/lib/classroom/toc";
import { siteUrl } from "@/lib/site-url";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, isDatabaseConfigured } from "@/lib/db";
import { notes, classroomSubcategories } from "@/lib/db/schema";

/**
 * Cached public pages.
 *
 * Anonymous visitors reading in English are rewritten (next.config.ts) from
 * /, /<subcategory> and /classroom/<slug> to static copies under /pub. Those
 * render once and are then served from Vercel's CDN, so a crawler or reader
 * costs no function time. The owner (session cookie) and Chinese readers
 * (`lang=zh` cookie or query) still get the per-request pages.
 *
 * Any write that changes what a public page shows must call
 * revalidatePublicPages(). Writes are owner-only and rare, so it drops every
 * cached public page at once rather than tracking which ones changed.
 */
export function revalidatePublicPages() {
  revalidatePath("/pub", "layout");
  revalidatePath("/pubzh", "layout");
  // Re-render every cached page right away, in one burst. Left to crawlers,
  // the re-renders trickle in over a day or more, and each one wakes the Neon
  // database for 5 minutes; one burst wakes it once. Production only: preview
  // deployments share the production database but must not touch the live
  // site's cache.
  if (process.env.VERCEL_ENV === "production") after(warmPublicPages);
}

/** Requests every public page (English and Chinese) as an anonymous visitor,
 * so each stale cached copy regenerates now. Six at a time keeps the burst
 * short without piling up on the 0.25 CU database. */
async function warmPublicPages() {
  try {
    const base = siteUrl();
    const toc = await loadClassroomToc(false, "en");
    const articles = toc.flatMap((sc) => [...sc.sections.flatMap((sec) => sec.articles), ...sc.unsectioned]);
    const paths = [
      "/",
      "/classroom",
      ...toc.map((sc) => `/${sc.slug}`),
      ...articles.map((a) => `/classroom/${a.slug}`),
    ];
    const urls = paths.flatMap((path) => [`${base}${path}`, `${base}${path}?lang=zh`]);
    let next = 0;
    const worker = async () => {
      while (next < urls.length) {
        const url = urls[next++];
        try {
          await fetch(url, { cache: "no-store", headers: { "user-agent": "brainbank-cache-warmer" } });
        } catch {
          // One failed page just regenerates on its next real visit.
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  } catch (err) {
    console.error("warmPublicPages failed:", err);
  }
}

/** Published article slugs, prerendered at build so the first visitor after
 * a deploy also gets a cached page. Build-time work costs no Active CPU. */
export async function publishedArticleSlugs(): Promise<{ slug: string }[]> {
  if (!isDatabaseConfigured) return [];
  try {
    return await db
      .select({ slug: notes.slug })
      .from(notes)
      .where(and(eq(notes.status, "published"), isNotNull(notes.category)));
  } catch (err) {
    console.error("publishedArticleSlugs failed; pages will render on first visit:", err);
    return [];
  }
}

export async function subcategorySlugs(): Promise<{ subcategorySlug: string }[]> {
  if (!isDatabaseConfigured) return [];
  try {
    const rows = await db.select({ slug: classroomSubcategories.slug }).from(classroomSubcategories);
    return rows.map((r) => ({ subcategorySlug: r.slug }));
  } catch (err) {
    console.error("subcategorySlugs failed; pages will render on first visit:", err);
    return [];
  }
}
