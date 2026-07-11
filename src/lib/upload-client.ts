"use client";

export interface UploadResult {
  provider: "cloudinary" | "r2";
  url: string;
}

function xhrUpload(
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

/**
 * Signs then uploads a file directly to whichever provider
 * /api/upload/sign picks for its mime type — the file bytes never pass
 * through a Vercel function (which caps request bodies at 4.5MB). Shared
 * by the note-media upload widget and the ingestion intake widget.
 */
export async function signAndUploadFile(
  noteId: number,
  file: File,
  onProgress: (pct: number) => void,
): Promise<UploadResult> {
  const signRes = await fetch("/api/upload/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      noteId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    }),
  });
  if (!signRes.ok) throw new Error(await signRes.text());

  const signed: {
    provider: "cloudinary" | "r2";
    uploadUrl: string;
    publicUrl?: string;
    fields?: Record<string, string>;
  } = await signRes.json();

  if (signed.provider === "cloudinary") {
    const form = new FormData();
    for (const [k, v] of Object.entries(signed.fields ?? {})) form.append(k, v);
    form.append("file", file);
    const responseText = await xhrUpload("POST", signed.uploadUrl, form, {}, onProgress);
    const parsed = JSON.parse(responseText) as { secure_url: string };
    return { provider: "cloudinary", url: parsed.secure_url };
  }

  await xhrUpload(
    "PUT",
    signed.uploadUrl,
    file,
    { "Content-Type": file.type || "application/octet-stream" },
    onProgress,
  );
  return { provider: "r2", 