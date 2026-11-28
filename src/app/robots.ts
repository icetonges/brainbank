import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/**
 * Every route in this app renders as a Vercel Function (the root layout and
 * header both read cookies), so each crawl of each URL is a billed
 * invocation. There was no robots.txt at all, which meant bots were free to
 * crawl the owner-only pages, the API routes and the chat UI — none of which
 * have anything to index.
 *
 * Note what is deliberately NOT disallowed: `?lang=` URLs. Every internal
 * link in the app carries that param, so a `Disallow: /*?` would stop
 * crawlers following any link out of the homepage and de-index the site. The
 * duplicate-URL problem is solved with canonical tags instead (see
 * generateMetadata in classroom/[slug] and [subcategorySlug]) plus a sitemap
 * of clean, param-free URLs.
 */
/**
 * Crawlers that bring no search traffic and fetch every article in full. In a
 * sampled hour Amazonbot and KeenableBot alone were ~25% of this project's
 * function time. Google and Bing stay allowed through the "*" rule. These are
 * the polite bots; the headless scrapers that ignore robots.txt have to be
 * stopped in the Vercel Firewall instead.
 */
const BLOCKED_CRAWLERS = [
  "Amazonbot",
  "KeenableBot",
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "Bytespider",
  "meta-externalagent",
  "FacebookBot",
  "PetalBot",
  "SemrushBot",
  "AhrefsBot",
  "MJ12bot",
  "DataForSeoBot",
  "DotBot",
  "BLEXBot",
  "ImagesiftBot",
  "Timpibot",
  "omgili",
  "Diffbot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: BLOCKED_CRAWLERS, disallow: "/" },
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/assistant",
          "/diary",
          "/graph",
          "/llm",
          "/login",
          "/obsidian",
          "/search",
          "/classroom/new",
          // Per-tab filters of the classroom index render per request; the
          // default view (no ?tab=) is cached and lists every article anyway.
          "/classroom?tab=",
          "/classroom?*&tab=",
          "/classroom/*/edit",
          // Internal targets of the cached-page rewrites; the public URLs
          // without /pub are the canonical ones.
          "/pub",
          "/pubzh",
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
