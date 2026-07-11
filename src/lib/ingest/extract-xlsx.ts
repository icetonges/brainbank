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
