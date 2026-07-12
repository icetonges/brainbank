"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import TurndownService from "turndown";
import { signAndUploadFile } from "@/lib/upload-client";
import { mediaKindFromMimeType } from "@/lib/storage/media-kind";
import { attachMediaAction } from "@/app/notes/[slug]/actions";
import {
  createClassroomDraft,
  publishClassroomArticle,
} from "@/app/classroom/actions";
import { t, type Lang } from "@/lib/i18n";

// Converts pasted rich HTML (from a rendered webpage, Google Doc, Notion,
// Word, another classroom article, etc.) into the markdown syntax this
// app's body field and <Markdown> renderer expect — headings, bold/italic,
// links, lists, blockquotes, and fenced code blocks with their language
// tag preserved (turndown's built-in fencedCodeBlock rule reads the
// `language-xxx` class turndown finds on the <code> element).
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  fence: "```",
  bulletListMarker: "-",
});

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
export function ClassroomComposer({
  categories,
  lang = "en",
}: {
  categories: TabOption[];
  lang?: Lang;
}) {
  const s = t(lang).classroom;
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The draft note images get attached to before the article exists —
  // created lazily on the first image so a plain text article never leaves
  // an empty draft behind.
  const [draft, setDraft] = useState<{ noteId: number; slug: string } | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inserts at an explicit [start, end) range rather than re-reading
  // el.selectionStart live, because by the time this runs the cursor may
  // no longer be where the user left it (see handleImage below).
  function insertAt(snippet: string, start: number, end: number) {
    const el = bodyRef.current;
    if (!el) return;
    el.value = el.value.slice(0, start) + snippet + el.value.slice(end);
    const pos = start + snippet.length;
    el.setSelectionRange(pos, pos);
    el.focus();
  }

  async function handleImage(file: File) {
    setError(null);
    setUploadPct(0);

    // Capture the cursor position *before* any async work. Opening the
    // native file picker (or the upload round-trips themselves) moves
    // focus away from the textarea, and by the time the upload finishes
    // el.selectionStart has usually collapsed to the end of the text —
    // which is why images were landing at the bottom instead of where
    // the user was typing.
    const el = bodyRef.current;
    const insertStart = el?.selectionStart ?? el?.value.length ?? 0;
    const insertEnd = el?.selectionEnd ?? insertStart;

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

      insertAt(`\n![${file.name}](${url})\n`, insertStart, insertEnd);
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
          placeholder={s.topicPlaceholder}
          className="flex-1 rounded-md border border-border bg-bg-elevated px-3 py-2 text-fg outline-none focus:border-accent"
        />
        <select
          name="category"
          defaultValue=""
          className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-fg outline-none focus:border-accent"
        >
          <option value="">{s.categoryAuto}</option>
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
        placeholder={s.bodyPlaceholder}
        onPaste={(e) => {
          const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
            f.type.startsWith("image/"),
          );
          if (file) {
            e.preventDefault();
            handleImage(file);
            return;
          }

          // Rich sources (a rendered webpage, Google Doc, Notion, Word,
          // another classroom article) put an HTML payload on the
          // clipboard alongside the plain-text one. A bare <textarea>
          // only ever uses the plain-text version, which is why headings,
          // bold, and code blocks were vanishing on paste — convert the
          // HTML to markdown ourselves so the formatting survives.
          const html = e.clipboardData?.getData("text/html");
          if (html && html.trim()) {
            e.preventDefault();
            const markdown = turndown.turndown(html).trim();
            const el = bodyRef.current;
            const start = el?.selectionStart ?? el?.value.length ?? 0;
            const end = el?.selectionEnd ?? start;
            insertAt(markdown, start, end);
          }
        }}
        className="min-h-[60vh] flex-1 resize-y rounded-lg border border-border bg-bg-elevated p-4 font-mono text-sm leading-relaxed text-fg outline-none focus:border-accent"
      />

      <div className="flex flex-wrap items-center gap-3">
        <SaveButton lang={lang} />

        <label className="cursor-pointer rounded-md border border-border px-3 py-2 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors">
          {uploadPct === null ? s.addImage : `${s.uploading} ${uploadPct}%`}
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

function SaveButton({ lang }: { lang: Lang }) {
  const { pending } = useFormStatus();
  const s = t(lang).classroom;
  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-5 py-2 font-semibold text-accent-fg hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {pending ? s.publishing : s.save}
      </button>
      {pending && (
        <span className="text-sm text-fg-secondary">{s.publishingHint}</span>
      )}
    </div>
  );
}
