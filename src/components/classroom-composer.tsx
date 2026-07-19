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
import {
  extractUrlsForComposer,
  extractDocumentForComposer,
} from "@/app/classroom/extract-actions";
import { t, type Lang } from "@/lib/i18n";
import { SubcategoryField } from "@/components/subcategory-field";

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

/** Document types the composer can extract text from (server-side, see
 * extract-actions.ts). Images are handled separately by handleImage. */
const DOC_EXTENSIONS = /\.(pdf|docx?|xlsx|xls|csv|pptx|txt|md|markdown|json)$/i;

function isDocFile(file: File): boolean {
  return DOC_EXTENSIONS.test(file.name);
}

/** If the pasted text is nothing but URLs (one or several, separated by
 * whitespace/newlines), return them — that's the "paste a link and get
 * the page's content" trigger. Any other prose means a normal paste. */
function parseUrlOnlyPaste(text: string): string[] | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 8) return null;
  if (!tokens.every((token) => /^https?:\/\/\S+$/i.test(token))) return null;
  return [...new Set(tokens)];
}

interface TabOption {
  value: string;
  label: string;
}

/**
 * The full-page AI Classroom composer: one big box that takes text,
 * markdown, images, documents (pdf, docx, xlsx, csv, pptx, txt, md,
 * json — attached, pasted, or dropped), and URLs (pasted alone, their
 * main content is fetched with the noise stripped). On Save,
 * publishClassroomArticle() rewrites everything into a polished article
 * and the AI publish assist builds its learning map, hands-on steps,
 * resources, and tags.
 */
export function ClassroomComposer({
  categories,
  subcategories = [],
  sections = [],
  lang = "en",
}: {
  categories: TabOption[];
  subcategories?: { id: number; name: string }[];
  sections?: { id: number; name: string; subcategoryId: number }[];
  lang?: Lang;
}) {
  const s = t(lang).classroom;
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The draft note images/documents get attached to before the article
  // exists — created lazily on the first upload so a plain text article
  // never leaves an empty draft behind.
  const [draft, setDraft] = useState<{ noteId: number; slug: string } | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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

  /** Marks where async content (a fetched URL, an extracted document)
   * will land: a visible placeholder goes in at the cursor immediately,
   * and gets swapped for the real content when it arrives — so slow
   * extractions never jump to wherever the cursor happens to be later. */
  function insertPlaceholder(placeholder: string) {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? el?.value.length ?? 0;
    const end = el?.selectionEnd ?? start;
    insertAt(`\n${placeholder}\n`, start, end);
  }

  function replacePlaceholder(placeholder: string, replacement: string) {
    const el = bodyRef.current;
    if (!el) return;
    const idx = el.value.indexOf(placeholder);
    if (idx === -1) {
      // User deleted the placeholder while we were fetching — append
      // instead of silently dropping the content.
      if (replacement) el.value = `${el.value.trimEnd()}\n\n${replacement}\n`;
      return;
    }
    el.value =
      el.value.slice(0, idx) + replacement + el.value.slice(idx + placeholder.length);
  }

  async function ensureDraft() {
    if (draft) return draft;
    const created = await createClassroomDraft();
    setDraft(created);
    return created;
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
      const target = await ensureDraft();
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
    }
  }

  /** Upload a document, keep it attached to the note as source material,
   * extract its text server-side, and drop the content in at the cursor. */
  async function handleDocument(file: File) {
    setError(null);
    const placeholder = `[⏳ ${s.extracting} ${file.name}…]`;
    insertPlaceholder(placeholder);
    setUploadPct(0);

    try {
      const target = await ensureDraft();
      const { provider, url } = await signAndUploadFile(target.noteId, file, setUploadPct);

      await attachMediaAction(target.noteId, target.slug, {
        kind: mediaKindFromMimeType(file.type || "application/octet-stream"),
        provider,
        url,
        sizeBytes: file.size,
        mimeType: file.type || "application/octet-stream",
      });

      setUploadPct(null);
      setBusy(`${s.extracting} ${file.name}…`);
      const { markdown } = await extractDocumentForComposer({ url, filename: file.name });
      replacePlaceholder(placeholder, markdown);
    } catch (err) {
      replacePlaceholder(placeholder, "");
      setError(err instanceof Error ? err.message : `Failed to extract ${file.name}`);
    } finally {
      setUploadPct(null);
      setBusy(null);
    }
  }

  /** Route a batch of files (picker, paste, or drop) one at a time —
   * parallel uploads would race on the lazy draft creation and fight
   * over the single progress indicator. */
  async function handleFiles(files: File[]) {
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        await handleImage(file);
      } else if (isDocFile(file)) {
        await handleDocument(file);
      } else {
        setError(`${s.unsupportedFile}: ${file.name}`);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /** Pasted bare URL(s): fetch each page server-side, strip the noise
   * (ads, nav, cookie banners — Readability), and insert the main
   * content; YouTube links insert title + thumbnail + transcript. */
  async function handleUrls(urls: string[]) {
    setError(null);
    const placeholders = urls.map((url) => `[⏳ ${s.fetchingUrl} ${url}…]`);
    insertPlaceholder(placeholders.join("\n"));
    setBusy(s.fetchingUrl);

    try {
      const results = await extractUrlsForComposer(urls);
      // Server preserves the deduped input order, so index-match against
      // it; look up by URL as a fallback in case of normalization.
      urls.forEach((url, i) => {
        const result = results[i]?.url === url ? results[i] : results.find((r) => r.url === url);
        replacePlaceholder(placeholders[i], result?.markdown ?? "");
      });
    } catch (err) {
      placeholders.forEach((p) => replacePlaceholder(p, ""));
      setError(err instanceof Error ? err.message : "Failed to fetch URL content");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form action={publishClassroomArticle} className="flex min-h-[80vh] flex-col gap-4">
      {draft && <input type="hidden" name="noteId" value={draft.noteId} />}

      {/* Topic + source URL side by side at 2:1 — the URL is provenance
          (where this content came from), saved to notes.sourceUrl and
          shown as a "Source" link on the article page. */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          name="topic"
          placeholder={s.topicPlaceholder}
          className="flex-[2] rounded-md border border-border bg-bg-elevated px-3 py-2 text-fg outline-none focus:border-accent"
        />
        {/* type="text", not "url" — browsers reject scheme-less pastes
            like "example.com/post" on submit; the server action
            normalizes those to https:// instead. */}
        <input
          type="text"
          inputMode="url"
          name="sourceUrl"
          placeholder={s.sourceUrlPlaceholder}
          className="flex-1 rounded-md border border-border bg-bg-elevated px-3 py-2 text-fg outline-none focus:border-accent"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <select
          name="category"
          defaultValue=""
          className="flex-1 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-fg outline-none focus:border-accent sm:min-w-[160px]"
        >
          <option value="">{s.categoryAuto}</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {/* Mandatory — the article page's single Translate button targets
            whichever language this ISN'T, so it has to be known up front
            rather than guessed from the content (auto-detection was the
            previous behavior and is why the translate button sometimes
            didn't show up where expected). */}
        <select
          name="language"
          required
          defaultValue=""
          className="flex-1 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-fg outline-none focus:border-accent invalid:text-fg-secondary sm:min-w-[160px]"
        >
          <option value="" disabled>
            {s.languagePrompt}
          </option>
          <option value="en">{s.languageEnglish}</option>
          <option value="zh">{s.languageChinese}</option>
        </select>
        {/* Optional finer-grained label within the subtab above (e.g.
            "Newsletters", "Claude Code Deep Dive") —
            backed by the classroom_subcategories table, sorted A→Z by the
            server; "+ Add new subcategory…" reveals a name field. Section
            (the subcategory's own subdivisions, e.g. "Quick Start", "Core
            Mechanisms") is filtered to whichever subcategory is picked. */}
        <SubcategoryField
          options={subcategories}
          sections={sections}
          className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          labels={{
            none: s.subcategoryNone,
            addNew: s.subcategoryAddNew,
            newPlaceholder: s.subcategoryNewPlaceholder,
            sectionNone: s.sectionNone,
            sectionAddNew: s.sectionAddNew,
            sectionNewPlaceholder: s.sectionNewPlaceholder,
          }}
        />
      </div>

      <textarea
        ref={bodyRef}
        name="body"
        required
        minLength={10}
        placeholder={s.bodyPlaceholder}
        onDragOver={(e) => {
          if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer?.files ?? []);
          if (files.length === 0) return;
          e.preventDefault();
          handleFiles(files);
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData?.files ?? []);
          if (files.length > 0 && files.some((f) => f.type.startsWith("image/") || isDocFile(f))) {
            e.preventDefault();
            handleFiles(files);
            return;
          }

          // A paste that is nothing but URL(s) means "go get that page's
          // content" — fetched server-side with ads/nav stripped. Checked
          // before the HTML branch because copying a link out of a
          // browser often puts an <a> tag on the clipboard too.
          const plain = e.clipboardData?.getData("text/plain") ?? "";
          const urls = parseUrlOnlyPaste(plain);
          if (urls) {
            e.preventDefault();
            handleUrls(urls);
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
          {uploadPct !== null ? `${s.uploading} ${uploadPct}%` : s.addFile}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xlsx,.xls,.csv,.pptx,.txt,.md,.markdown,.json"
            multiple
            className="hidden"
            disabled={uploadPct !== null || busy !== null}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) handleFiles(files);
            }}
          />
        </label>

        {busy && uploadPct === null && (
          <span className="text-sm text-fg-secondary">{busy}</span>
        )}
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
