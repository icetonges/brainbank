import type { ExtractedSource } from "./types";
import { loadPdfParse } from "./pdf-runtime";

const MAX_CHARS = 20000;

export async function extractFromPdf(fileUrl: string, filename: string): Promise<ExtractedSource> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to download PDF: HTTP ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());

  const { PDFParse } = await loadPdfParse();
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return {
      title: filename.replace(/\.pdf$/i, ""),
      text: result.text.trim().slice(0, MAX_CHARS),
    };
  } finally {
    await parser.destroy();
  }
}
