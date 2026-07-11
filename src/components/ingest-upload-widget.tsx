"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signAndUploadFile } from "@/lib/upload-client";
import { createDraftNoteForUpload, startFileIngestion } from "@/app/new/ingest-actions";
import type { SourceType } from "@/lib/db/schema";

function sourceTypeForFile(file: File): SourceType | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    file.type === "application/msword" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".doc") ||
    name.endsWith(".docx")
  ) {
    return "docx";
  }
  if (
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "text/csv" ||
    name.endsWith(".xlsx") ||
    name.endsWith(".csv")
  ) {
    return "xlsx";
  }
  return null;
}

// Auto-build a note from an uploaded document: create a draft note, upload
// the file to R2 (same direct-to-storage path as the note-media widget),
// then hand off to the Inngest ingestion pipeline (PLAN.md §5) and
// navigate to the note, which shows a processing state until it's done.
export function IngestUploadWidget() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    const sourceType = sourceTypeForFile(file);
    if (!sourceType) {
      setError(
        "Only PDF, docx, and xlsx/csv are supported for auto-build right now. For images or video, create a note first and attach media there.",
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setStage("Creating note");
    setProgress(0);
    try {
      const { noteId, slug } = await createDraftNoteForUpload(file.name, sourceType);

      setStage("Uploading");
      const { url } = await signAndUploadFile(noteId, file, setProgress);

      setStage("Starting AI build");
      await startFileIngestion(noteId, url, file.name, sourceType);

      router.push(`/notes/${slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setProgress(null);
      setStage(null);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="cursor-pointer self-start rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors">
        {stage ? `${stage}${progress !== null ? ` ${progress}%` : "…"}` : "Upload a PDF, docx, or spreadsheet"}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xlsx,.csv"
          className="hidden"
          disabled={stage !== null}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
