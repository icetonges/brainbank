import JSZip from "jszip";
import type { ExtractedSource } from "./types";

const MAX_CHARS = 20_000;
const MAX_SLIDES = 100;

/** Decode the handful of XML entities that appear in DrawingML text runs. */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

/** All visible text runs (<a:t>…</a:t>) in one slide's XML, paragraph-ish:
 * runs inside the same <a:p> join with no break, paragraphs join with
 * newlines. A full XML parser would be overkill — DrawingML text runs are
 * flat and never nest. */
function slideText(xml: string): string {
  const paragraphs = xml.split(/<\/a:p>/);
  const lines: string[] = [];
  for (const para of paragraphs) {
    const runs = [...para.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) =>
      decodeXmlEntities(m[1]),
    );
    const line = runs.join("").trim();
    if (line) lines.push(line);
  }
  return lines.join("\n");
}

/**
 * Extracts the text content of a .pptx: each slide's text runs (titles,
 * bullets, text boxes, tables) in slide order, plus speaker notes where
 * present. A .pptx is a zip of XML parts — jszip (already a dependency of
 * exceljs) unpacks it; no PowerPoint runtime needed.
 */
export async function extractFromPptx(
  fileUrl: string,
  filename: string,
): Promise<ExtractedSource> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to download presentation: HTTP ${res.status}`);
  const zip = await JSZip.loadAsync(await res.arrayBuffer());

  const slideNumber = (path: string) => Number(path.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b))
    .slice(0, MAX_SLIDES);
  if (slidePaths.length === 0) throw new Error("No slides found in this .pptx");

  const parts: string[] = [];
  for (const path of slidePaths) {
    const n = slideNumber(path);
    const xml = await zip.file(path)!.async("string");
    const text = slideText(xml);

    const notesFile = zip.file(`ppt/notesSlides/notesSlide${n}.xml`);
    const notes = notesFile ? slideText(await notesFile.async("string")) : "";

    const block = [
      `## Slide ${n}`,
      text,
      notes ? `Speaker notes:\n${notes}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    parts.push(block);
  }

  return {
    title: filename.replace(/\.pptx$/i, ""),
    text: parts.join("\n\n").slice(0, MAX_CHARS),
  };
}
