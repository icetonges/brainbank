"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mediaKindFromMimeType } from "@/lib/storage/media-kind";
import { attachMediaAction } from "@/app/notes/[slug]/actions";
import { signAndUploadFile } from "@/lib/upload-client";

export function UploadWidget({ noteId, slug }: { noteId: number; slug: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setProgress(0);
    try {
      const { provider, url } = await signAndUploadFile(noteId, file, setProgress);

      await attachMediaAction(noteId, slug, {
        kind: mediaKindFromMimeType(file.type || "application/octet-stream"),
        provider,
        url,
        sizeBytes: file.size,
        mimeType: file.type || "application/octet-stream",
      });

      setProgress(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setProgress(null);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors">
          {progress === null ? "Upload file" : `Uploading… ${progress}%`}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            disabled={progress !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
        <span className="text-xs text-fg-secondary">
          Images/video → Cloudinary. PDF/docx/xlsx/other → R2 (up to 50MB+).
        </span>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
