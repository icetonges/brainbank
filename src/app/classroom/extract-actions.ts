"use server";

import { auth } from "@/auth";
import { assertSafePublicUrl } from "@/lib/intake";
import { extractFromUrl } from "@/lib/ingest/extract-url";
import { extractFromYoutube } from "@/lib/ingest/extract-youtube";
import { extractFromPdf } from "@/lib/ingest/extract-pdf";
import { extractFromDocx } from "@/lib/ingest/extract-docx";
import { extractFromXlsx } from "@/lib/ingest/extract-xlsx";
import { extractFromPptx } from "@/lib/ingest/extract-pptx";
import { extractFromTextFile } from "@/lib/ingest/extract-text";
import type { ExtractedSource } from "@/lib/ingest/types";

// The composer's "drop anything in the box" server side: turn URLs and
// uploaded documents into markdown the body field can hold. Extraction is
// plain code (Readability strips ads/nav/chrome from webpages; the file
// parsers read only document content) — the AI formatting pass at Save
// (formatArticleContent) then restructures whatever lands here.

const MAX_URLS = 8;

async function requireOwner() {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
}

const YOUTUBE_RE = /(?:youtube\.com\/(?:watch|shorts|live|embed)|youtu\.be\/)/i;

/** One extracted source, rendered as a composer-ready markdown block. */
function toMarkdownBlock(source: ExtractedSource, sourceLabel?: string): string {
  return [
    `## ${source.title}`,
    source.imageUrl ? `![${source.title}](${source.imageUrl})` : "",
    source.text,
    sourceLabel ? `Source: ${sourceLabel}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface UrlExtractionResult {
  url: string;
  ok: boolean;
  /** Composer-ready markdown block (ok) or a human-readable error (!ok). */
  markdown: string;
}

/**
 * Fetches one or more pasted URLs and returns each page's *main content*
 * as a markdown block — Readability (the Reader-Mode algorithm) drops
 * ads, navigation, sidebars, cookie banners, and footers; YouTube links
 * come back as title + thumbnail + transcript. Per-URL failures return an
 * error entry instead of sinking the whole batch, so pasting five links
 * where one is dead still yields four articles' content.
 */
export async function extractUrlsForComposer(
  urls: string[],
): Promise<UrlExtractionResult[]> {
  await requireOwner();

  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))].slice(0, MAX_URLS);

  return Promise.all(
    unique.map(async (url): Promise<UrlExtractionResult> => {
      try {
        const source = YOUTUBE_RE.test(url)
          ? await extractFromYoutube(url)
          : await extractFromUrl(url);
        if (!source.text.trim()) throw new Error("No readable content found on this page");
        return { url, ok: true, markdown: toMarkdownBlock(source, url) };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Extraction failed";
        return { url, ok: false, markdown: `> ⚠️ Could not extract ${url} — ${message}` };
      }
    }),
  );
}

export interface DocumentExtractionInput {
  /** The file's public URL after the signed upload (R2/Cloudinary). */
  url: string;
  filename: string;
}

/**
 * Extracts the text content of an uploaded document — pdf, docx, xlsx,
 * csv, pptx, txt, md, or json — and returns it as a composer-ready
 * markdown block. Dispatches on the file extension, mirroring
 * src/lib/ingest/extract.ts but shaped for the classroom composer (one
 * markdown string in, no note plumbing).
 */
export async function extractDocumentForComposer(
  input: DocumentExtractionInput,
): Promise<{ markdown: string }> {
  await requireOwner();
  assertSafePublicUrl(input.url);

  const name = input.filename.toLowerCase();
  let source: ExtractedSource;
  if (name.endsWith(".pdf")) {
    source = await extractFromPdf(input.url, input.filename);
  } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
    source = await extractFromDocx(input.url, input.filename);
  } else if (name.endsWith(".xlsx") || name.endsWith(".csv") || name.endsWith(".xls")) {
    source = await extractFromXlsx(input.url, input.filename);
  } else if (name.endsWith(".pptx")) {
    source = await extractFromPptx(input.url, input.filename);
  } else if (/\.(txt|md|markdown|json)$/.test(name)) {
    source = await extractFromTextFile(input.url, input.filename);
  } else {
    throw new Error(
      "Unsupported document type — use pdf, docx, xlsx, csv, pptx, txt, md, or json",
    );
  }

  if (!source.text.trim()) {
    throw new Error(`No text content found in ${input.filename}`);
  }
  return { markdown: toMarkdownBlock(source, input.filename) };
}
