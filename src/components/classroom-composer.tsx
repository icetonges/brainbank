"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { signAndUploadFile } from "@/lib/upload-client";
import { mediaKindFromMimeType } from "@/lib/storage/media-kind";
import { attachMediaAction } from "@/app/notes/[slug]/actions";
import {
  createClassroomDraft,
  publishClassroomArticle,
} from "@/app/classroom/actions";

interface TabOption {
  value: string;
  label: string;
}

/**
 * The full-page AI Classroom composer: one big box that takes text,
 * markdown formatting, image files (attached or pasted — they upload
 * immediately and drop in as markdown), URLs, and YouTube links. On Save,
 * publishClassroomArticle() creates the knowledge page and the AI publish
 * assist builds its learning map, hands-on steps, resources, and tags.
 */
export function ClassroomComposer({ categories }: { categories: TabOption[] }) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The draft note images get attached to before the article exists —
  // created lazily on the first image so a plain text article never leaves
  // an empty draft behind.
  const [draft, setDraft] = useState<{ noteId: number; slug: string } | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function insertAtCursor(snippet: string) {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + snippet + el.value.slice(end);
    const pos = start + snippet.length;
    el.setSelectionRange(pos, pos);
    el.focus();
  }

  async function handleImage(file: File) {
    setError(null);
    setUploadPct(0);
    try {
      let target = draft;
      if (!target) {
        target = await createClassroomDraft();
        setDraft(target);
      }

      const { provider, url } = await signAndUploadFile(target.noteId, file, setUploadPct);

      await attachMediaAction(target.noteId, target.slug, {
        kind: mediaKindFromMimeType(file.type || "application/octet-stream"),
        provider,
        url,
        sizeBytes: file.size,
        mimeType: file.type || "application/octet-stream",
      });

      insertAtCursor(`\n![${file.name}](${url})\n`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploadPct(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <form action={publishClassroomArticle} className="flex min-h-[80vh] flex-col gap-4">
      {draft && <input type="hidden" name="noteId" value={draft.noteId} />}

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          name="topic"
          placeholder="Topic (leave blank — AI will name it from the content)"
          className="flex-1 rounded-md border border-border bg-bg-elevated px-3 py-2 text-fg outline-none focus:border-accent"
        />
        <select
          name="category"
          defaultValue=""
          className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-fg outline-none focus:border-accent"
        >
          <option value="">Subtab: auto (AI decides)</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <textarea
        ref={bodyRef}
        name="body"
        required
        minLength={10}
        placeholder={
          "Drop everything here — text, markdown formatting, URLs, YouTube links…\n" +
          "Paste or attach images and they'll upload and appear as markdown.\n\n" +
          "Click Save and AI publish assist will build the knowledge page: a learning map, step-by-step hands-on instructions, the top 3 sources, and tags for the right AI Classroom subtab."
        }
        onPaste={(e) => {
          const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
            f.type.startsWith("image/"),
          );
          if (file) {
            e.preventDefault();
            handleImage(file);
          }
        }}
        className="min-h-[60vh] flex-1 resize-y rounded-lg border border-border bg-bg-elevated p-4 font-mono text-sm leading-relaxed text-fg outline-none focus:border-accent"
      />

      <div className="flex flex-wrap items-center gap-3">
        <SaveButton />

        <label className="cursor-pointer rounded-md border border-border px-3 py-2 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors">
          {uploadPct === null ? "Add image" : `Uploading… ${uploadPct}%`}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploadPct !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImage(file);
            }}
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-5 py-2 font-semibold text-accent-fg hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {pending ? "Publishing…" : "Save"}
      </button>
      {pending && (
        <span className="text-sm text-fg-secondary">
          AI publish assist is building the learning map, hands-on steps, and sources…
        </span>
      )}
    </div>
  );
}
