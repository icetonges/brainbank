"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mediaKindFromMimeType } from "@/lib/storage/media-kind";
import { attachMediaAction } from "@/app/notes/[slug]/actions";
import type { MediaProvider } from "@/lib/db/schema";

interface SignResponse {
  provider: MediaProvider;
  uploadUrl: string;
  publicUrl?: string;
  fields?: Record<string, string>;
}

// Uploads go straight from the browser to Cloudinary or R2 (whichever
// /api/upload/sign says to use for this file's mime type) — the file bytes
// never pass through a Vercel function, which is what makes 50MB+ files
// workable on Vercel's free tier (PLAN.md §2/§7).
function uploadWithProgress(
  method: "PUT" | "POST",
  url: string,
  body: FormData | File,
  headers: Record<string, string>,
  onProgress: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText);
      } else {
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText.slice(0, 200)}`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed (network error)"));
    xhr.send(body);
  });
}

export function UploadWidget({ noteId, slug }: { noteId: number; slug: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setProgress(0);
    try {
      const signRes = await fetch("/api/upload/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId, filename: file.name, mimeType: file.type || "application/octet-stream" }),
      });
      if (!signRes.ok) throw new Error(await signRes.text());
      const signed: SignResponse = await signRes.json();

      let finalUrl: string;
      if (signed.provider === "cloudinary") {
        const form = new FormData();
        for (const [k, v] of Object.entries(signed.fields ?? {})) form.append(k, v);
        form.append("file", file);
        const responseText = await uploadWithProgress("POST", signed.uploadUrl, form, {}, setProgress);
        const parsed = JSON.parse(responseText) as { secure_url: string };
        finalUrl = parsed.secure_url;
      } else {
        await uploadWithProgress(
          "PUT",
          signed.uploadUrl,
          file,
          { "Content-Type": file.type || "application/octet-stream" },
          setProgress,
        );
        finalUrl = signed.publicUrl!;
      }

      await attachMediaAction(noteId, slug, {
        kind: mediaKindFromMimeType(file.type || "application/octet-stream"),
        provider: signed.provider,
        url: finalUrl,
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
