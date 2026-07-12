// Slugs are used directly as the URL path segment (/classroom/[slug],
// /notes/[slug]). Non-ASCII characters (e.g. Chinese titles) technically
// survive slugify() and look fine when the link is generated, but they
// break the round trip through Next.js's dynamic route param on Vercel:
// the value that comes back out of params.slug stops matching the exact
// string stored in the DB, so the lookup silently misses and the page
// 404s even though the row exists. ASCII-only slugs sidestep that
// entirely and keep URLs shareable/readable regardless of language.
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "note";
}
