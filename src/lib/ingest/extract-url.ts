import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import type { ExtractedSource } from "./types";
import { assertSafePublicUrl } from "@/lib/intake";

const MAX_CHARS = 20000;

/** Fetches a page and pulls the readable article out of it (title, body
 * text, hero image) — the same kind of extraction Reader Mode / Pocket do.
 * Code-first per PLAN.md §13: no LLM involved in getting the raw text out
 * of the page, only in what happens to that text afterward.
 *
 * Uses linkedom rather than jsdom: jsdom's transitive dependency chain
 * (html-encoding-sniffer -> @exodus/bytes, an ESM-only package) fails to
 * load under Vercel's Turbopack server bundle with ERR_REQUIRE_ESM, which
 * crashed this entire route (and every other ingestion source, since they
 * share one bundled module graph) on cold start in production. linkedom is
 * a much lighter DOM implementation built for exactly this
 * serverless/bundler compatibility case and is a standard drop-in for
 * Readability-based scraping. */
export async function extractFromUrl(url: string): Promise<ExtractedSource> {
  assertSafePublicUrl(url);
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; brainbank/1.0; +https://github.com/icetonges/brainbank)",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  const html = await res.text();

  const { document: doc } = parseHTML(html);
  try {
    // Best-effort: lets Readability resolve any relative URLs it encounters
    // against the real page URL. Not load-bearing for the text we actually
    // use downstream, so swallow any failure rather than let it break
    // extraction.
    doc.location = url;
  } catch {
    // ignore
  }

  const ogImage =
    doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? undefined;

  const reader = new Readability(doc as unknown as Document);
  const article = reader.parse();

  if (!article?.textContent?.trim()) {
    // Readability couldn't find an "article" (common on non-article pages)
    // — fall back to all the visible body text rather than failing outright.
    const fallbackText = doc.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return {
      title: doc.title || url,
      text: fallbackText.slice(0, MAX_CHARS),
      imageUrl: ogImage,
    };
  }

  return {
    title: article.title || doc.title || url,
    text: article.textContent.trim().slice(0, MAX_CHARS),
    excerpt: article.excerpt ?? undefined,
    imageUrl: ogImage,
  };
}
