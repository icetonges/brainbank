import type { MediaKind } from "@/lib/db/schema";

/** Which of our media buckets a mime type belongs in. */
export function mediaKindFromMimeType(mimeType: string): MediaKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType === "application/msword" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "doc";
  }
  if (
    mimeType === "application/vnd.ms-excel" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "text/csv"
  ) {
    return "spreadsheet";
  }
  return "other";
}

/** Cloudinary renders/transforms images and video; everything else (PDF,
 * docx, xlsx, md, ...) goes to R2 as a raw object — see PLAN.md §2/§7. */
export function providerForMimeType(mimeType: string): "cloudinary" | "r2" {
  return mimeType.startsWith("image/") || mimeType.startsWith("video/")
    ? "cloudinary"
    : "r2";
}
