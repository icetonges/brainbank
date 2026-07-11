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

/** Turns "my-vacation-photo_2024.jpg" into "My vacation photo 2024" — a
 * reasonable default title for media with no other metadata to draw from. */
function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  const withSpaces = base.length > 0 ? base : "Untitled upload";
  const capitalized = withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
  return capitalized.slice(0, 200);
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
      if (!input.mediaUrl) throw new Error("Missing mediaUrl for xlsx ingestion");
      return extractFromXlsx(input.mediaUrl, input.filename ?? "spreadsheet.xlsx");
    case "image":
      // No text to extract — the upload itself is the content. Skips the
      // AI drafting step entirely (see runIngestionDirect in
      // src/lib/inngest/ingest-source.ts): title comes from the filename,
      // the image becomes the note's media, and What/How/Why are left for
      // the owner (or AI Assist) to fill in.
      if (!input.mediaUrl) throw new Error("Missing mediaUrl for image ingestion");
      return {
        title: titleFromFilename(input.filename ?? "image"),
        text: "",
        imageUrl: input.mediaUrl,
      };
    case "video":
      if (!input.mediaUrl) throw new Error("Missing mediaUrl for video ingestion");
      return {
        title: titleFromFilename(input.filename ?? "video"),
        text: "",
      };
    default:
      throw new Error(`Unsupported ingestion source type: ${input.sourceType}`);
  }
}
