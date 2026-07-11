import mammoth from "mammoth";
import type { ExtractedSource } from "./types";

const MAX_CHARS = 20000;

export async function extractFromDocx(fileUrl: string, filename: string): Promise<ExtractedSource> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to download document: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const result = await mammoth.extractRawText({ buffer });
  return {
    title: filename.replace(/\.docx?$/i, ""),
    text: result.value.trim().slice(0, MAX_CHARS),
  };
}
