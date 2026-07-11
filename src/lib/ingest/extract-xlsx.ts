import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import type { ExtractedSource } from "./types";

const MAX_CHARS = 20_000;
const MAX_SHEETS = 5;
const MAX_ROWS_PER_SHEET = 2_000;

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value) return String(value.text);
    if ("result" in value) return String(value.result ?? "");
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    return JSON.stringify(value);
  }
  return String(value);
}

export async function extractFromXlsx(fileUrl: string, filename: string): Promise<ExtractedSource> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to download spreadsheet: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const workbook = new ExcelJS.Workbook();

  if (filename.toLowerCase().endsWith(".csv")) {
    await workbook.csv.read(Readable.from(buffer));
  } else if (filename.toLowerCase().endsWith(".xlsx")) {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } else {
    throw new Error("Legacy .xls files are not supported; save the workbook as .xlsx or .csv first");
  }

  const sheetTexts = workbook.worksheets.slice(0, MAX_SHEETS).map((sheet) => {
    const rows: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > MAX_ROWS_PER_SHEET) return;
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(values.map((value) => JSON.stringify(cellText(value))).join(","));
    });
    return `## ${sheet.name}\n${rows.join("\n")}`;
  });

  return {
    title: filename.replace(/\.(xlsx|csv)$/i, ""),
    text: sheetTexts.join("\n\n").slice(0, MAX_CHARS),
  };
}
