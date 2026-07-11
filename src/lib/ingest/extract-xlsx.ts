import * as XLSX from "xlsx";
import type { ExtractedSource } from "./types";

const MAX_CHARS = 20000;

export async function extractFromXlsx(fileUrl: string, filename: string): Promise<ExtractedSource> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to download spreadsheet: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetTexts = workbook.SheetNames.slice(0, 5).map((name) => {
    const sheet = workbook.Sheets[name];
    return `## ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`;
  });

  return {
    title: filename.replace(/\.(xlsx|xls|csv)$/i, ""),
    text: sheetTexts.join("\n\n").slice(0, MAX_CHARS),
  };
}
