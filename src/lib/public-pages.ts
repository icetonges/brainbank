import { revalidatePath } from "next/cache";
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
