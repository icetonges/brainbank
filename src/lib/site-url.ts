/**
 * Absolute origin for canonical links, robots.txt and the sitemap.
 *
 * Vercel sets VERCEL_PROJECT_PRODUCTION_URL to the project's production
 * domain on every deployment (preview builds included), so canonicals keep
 * pointing at production rather than at a preview hostname. SITE_URL
 * overrides it for a custom domain or local work.
 */
export function siteUrl(): string {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
