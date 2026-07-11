import type { SourceType } from "@/lib/db/schema";
import type { ExtractedSource } from "./types";
import { extractFromUrl } from "./extract-url";
import { extractFromYoutube } from "./extract-youtube";
import { extractFromPdf } from "./extract-pdf";
import { extractFromDocx } from "./extract-docx";
import { extractFromXlsx } from "./extract-xlsx";

export interface ExtractInput {
  sourceType: SourceType;
  sourceUrl?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  rawText?: string | null;
}

/** Single dispatch point: given a source type and where to find it, return
 * the raw extracted title/text. Every extractor here is plain code, no
 * LLM — the AI only enters at the drafting step afterward (tasks.ts),
 * per PLAN.md §13. */
export async function extractSource(input: ExtractInput): Promise<ExtractedSource> {
  switch (input.sourceType) {
    case "manual":
      if (!input.rawText?.trim()) throw new Error("Missing text for text ingestion");
      return { title: "Text capture", text: input.rawText.trim().slice(0, 100_000) };
    case "url":
      if (!input.sourceUrl) throw new Error("Missing sourceUrl for url ingestion");
      return extractFromUrl(input.sourceUrl);
    case "youtube":
      if (!input.sourceUrl) throw new Error("Missing sourceUrl for youtube ingestion");
      return extractFromYoutube(input.sourceUrl);
    case "pdf":
      if (!input.mediaUrl) throw new Error("Missing mediaUrl for pdf ingestion");
      return extractFromPdf(input.mediaUrl, input.filename ?? "document.pdf");
    case "docx":
      if (!input.mediaUrl) throw new Error("Missing mediaUrl for docx ingestion");
      return extractFromDocx(input.mediaUrl, input.filename ?? "document.docx");
    case "xlsx":
      if (!input.mediaUrl) throw new Error("Missi