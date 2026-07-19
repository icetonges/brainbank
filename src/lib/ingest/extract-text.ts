import type { ExtractedSource } from "./types";

const MAX_CHARS = 50_000;

/**
 * Plain-text-family files: .txt and .md pass through as-is (markdown IS
 * the composer's native format), .json gets pretty-printed inside a fenced
 * block so it renders readably and survives the AI formatting pass intact.
 */
export async function extractFromTextFile(
  fileUrl: string,
  filename: string,
): Promise<ExtractedSource> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to download file: HTTP ${res.status}`);
  const raw = (await res.text()).trim();

  const title = filename.replace(/\.(txt|md|markdown|json)$/i, "");

  if (/\.json$/i.test(filename)) {
    let pretty = raw;
    try {
      pretty = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      // Not valid JSON — keep the raw text; the fence still renders it.
    }
    return { title, text: `\`\`\`json\n${pretty.slice(0, MAX_CHARS)}\n\`\`\`` };
  }

  return { title, text: raw.slice(0, MAX_CHARS) };
}
