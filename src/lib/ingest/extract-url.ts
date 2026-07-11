import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { ExtractedSource } from "./types";

const MAX_CHARS = 20000;

/** Fetches a page and pulls the readable article out of it (title, body
 * text, hero image) — the same kind of extraction Reader Mode / Pocket do.
 * Code-first per PLAN.md §13: no LLM involved in getting the raw text out
 * of the page, only in what happens to that text afterward. */
export async function extractFromUrl(url: string): Promise<ExtractedSource> {
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

  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  const ogImage =
    doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? undefined;

  const reader = new Readability(doc);
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
