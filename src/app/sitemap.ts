import type { MetadataRoute } from "next";
import { loadClassroomToc } from "@/lib/classroom/toc";
import { siteUrl } from "@/lib/site-url";

// Served from the cached TOC (one entry per isOwner/lang, invalidated by
// CLASSROOM_TOC_TAG), so a crawler hitting this costs a map over cached rows
// rather than three DB queries.
export const revalidate = 3600;

/**
 * Clean, param-free URLs for every published classroom article and
 * subcategory landing page. Paired with the canonical tags on those pages,
 * this is what steers crawlers away from the `?lang=` variants of the same
 * content — every internal link in the app carries that param, so without
 * this each article is reachable at three URLs and gets crawled three times.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  // isOwner: false — the sitemap must only ever list publicly visible pages.
  const toc = await loadClassroomToc(false, "en");

  const articles = toc.flatMap((sc) => [
    ...sc.sections.flatMap((sec) => sec.articles),
    ...sc.unsectioned,
  ]);

  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/classroom`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/trends`, changeFrequency: "daily", priority: 0.5 },
    ...toc.map((sc) => ({
      url: `${base}/${sc.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...articles.map((a) => ({
      url: `${base}/classroom/${a.slug}`,
      lastModified: a.createdAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
