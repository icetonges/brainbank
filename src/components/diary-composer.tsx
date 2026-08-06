"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import TurndownService from "turndown";
import { signAndUploadFile } from "@/lib/upload-client";
import { mediaKindFromMimeType } from "@/lib/storage/media-kind";
import { attachMediaAction } from "@/app/notes/[slug]/actions";
import { createDiaryDraft, saveDiaryDraft, saveDiaryEntry } from "@/app/diary/actions";
import { extractDocumentForComposer } from "@/app/classroom/extract-actions";
import { LIFE_AREAS } from "@/lib/knowledge/taxonomy";
import { t, type Lang } from "@/lib/i18n";
import { Markdown } from "@/components/markdown";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  fence: "```",
  bulletListMarker: "-",
});

/** Document types the composer can attach (and, on request, extract text
 * from) — mirrors DOC_EXTENSIONS in classroom-composer.tsx and the server
 * side's extractDocumentForComposer / mediaKindFromMimeType. */
const DOC_EXTENSIONS = /\.(pdf|docx?|xlsx|xls|csv|pptx|txt|md|markdown|json)$/i;

function isDocFile(file: File): boolean {
  return DOC_EXTENSIONS.test(file.name);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

const MOODS = [
  { value: "great", emoji: "🤩" },
  { value: "good", emoji: "🙂" },
  { value: "neutral", emoji: "😐" },
  { value: "low", emoji: "😕" },
  { value: "rough", emoji: "😣" },
] as const;

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in LOCAL time — toISOString()
 *  would shift by the timezone offset and silently misdate every entry. */
function localDateTimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The diary composer. Deliberately simple to *write into* — one big box,
 * everything else optional and out of the way — while still supporting
 * images (paste, drop, or attach), a separate scratch pad for fragments,
 * and one-click mood/energy.
 *
 * Everything except the body is optional: title auto-generates from the
 * content, tags auto-generate, the timestamp defaults to now. The intent
 * is that writing an entry costs nothing more than typing and hitting save.
 */
export function DiaryComposer({
  lang = "en",
  defaultOccurredAt,
}: {
  lang?: Lang;
  /** ISO string from the server so SSR and client agree on "now". */
  defaultOccurredAt: string;
}) {
  const s = t(lang).diary;
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const scratchRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const occurredAtRef = useRef<HTMLInputElement>(null);
  const languageRef = useRef<HTMLSelectElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [draft, setDraft] = useState<{ noteId: number; slug: string } | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mood, setMood] = useState<string>("");
  const [energy, setEnergy] = useState<number>(0);
  const [pickedTags, setPickedTags] = useState<string[]>([]);
  const [showScratch, setShowScratch] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved">("idle");
  // Mirrors bodyRef's value into React state so the word count and the
  // Preview tab can read it — the textarea itself stays uncontrolled
  // (see insertAtCursor etc.) so typing doesn't fight cursor position.
  const [bodyText, setBodyText] = useState("");
  const [bodyMode, setBodyMode] = useState<"write" | "preview">("write");
  // Documents attach immediately (as a file-card link) but their text is
  // only pulled into the entry on request — a diary entry shouldn't
  // silently balloon into the full contents of whatever PDF got dropped
  // in. This is the queue of "attached, not yet extracted" documents.
  const [pendingDocs, setPendingDocs] = useState<{ id: string; name: string; url: string }[]>([]);
  const [extractingId, setExtractingId] = useState<string | null>(null);

  function insertAtCursor(
    el: HTMLTextAreaElement | null,
    snippet: string,
    start: number,
    end: number,
  ) {
    if (!el) return;
    el.value = el.value.slice(0, start) + snippet + el.value.slice(end);
    const pos = start + snippet.length;
    el.setSelectionRange(pos, pos);
    el.focus();
  }

  /** Wraps the selection in `before`/`after` (e.g. **bold**). With no
   *  selection, inserts `placeholder` pre-selected so typing overwrites it. */
  function wrapSelection(
    el: HTMLTextAreaElement | null,
    before: string,
    after: string,
    placeholder: string,
  ) {
    if (!el) return;
    const { selectionStart: start, selectionEnd: end, value } = el;
    const hadSelection = start !== end;
    const selected = hadSelection ? value.slice(start, end) : placeholder;
    const snippet = `${before}${selected}${after}`;
    el.value = value.slice(0, start) + snippet + value.slice(end);
    el.focus();
    if (hadSelection) {
      el.setSelectionRange(start, start + snippet.length);
    } else {
      el.setSelectionRange(start + before.length, start + before.length + placeholder.length);
    }
  }

  /** Expands the selection to whole lines, for prefix-based markdown
   *  (headings, quotes, lists) that has to start at the beginning of a line. */
  function lineBounds(el: HTMLTextAreaElement) {
    const { selectionStart: start, selectionEnd: end, value } = el;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextBreak = value.indexOf("\n", end);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    return { lineStart, lineEnd, value };
  }

  /** Toggles a literal prefix (e.g. "## ", "> ") on every non-blank line
   *  touched by the selection. Removes it if every touched line already has it. */
  function toggleLinePrefix(el: HTMLTextAreaElement | null, prefix: string) {
    if (!el) return;
    const { lineStart, lineEnd, value } = lineBounds(el);
    const lines = value.slice(lineStart, lineEnd).split("\n");
    const allPrefixed = lines.every((line) => line.trim() === "" || line.startsWith(prefix));
    const newLines = lines.map((line) =>
      line.trim() === "" ? line : allPrefixed ? line.slice(prefix.length) : prefix + line,
    );
    const newBlock = newLines.join("\n");
    el.value = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
    el.focus();
    el.setSelectionRange(lineStart, lineStart + newBlock.length);
  }

  /** Numbers every non-blank line touched by the selection ("1. ", "2. ", …),
   *  or strips existing numbering if the whole block is already numbered. */
  function toggleOrderedList(el: HTMLTextAreaElement | null) {
    if (!el) return;
    const { lineStart, lineEnd, value } = lineBounds(el);
    const lines = value.slice(lineStart, lineEnd).split("\n");
    const pattern = /^\d+\.\s/;
    const allOrdered = lines.every((line) => line.trim() === "" || pattern.test(line));
    let n = 1;
    const newLines = lines.map((line) => {
      if (line.trim() === "") return line;
      return allOrdered ? line.replace(pattern, "") : `${n++}. ${line}`;
    });
    const newBlock = newLines.join("\n");
    el.value = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
    el.focus();
    el.setSelectionRange(lineStart, lineStart + newBlock.length);
  }

  function insertDivider(el: HTMLTextAreaElement | null) {
    if (!el) return;
    const { selectionStart: start, selectionEnd: end, value } = el;
    const leadingNl = start > 0 && value[start - 1] !== "\n" ? "\n\n" : "";
    const trailingNl = end < value.length && value[end] !== "\n" ? "\n\n" : "\n";
    const snippet = `${leadingNl}---${trailingNl}`;
    el.value = value.slice(0, start) + snippet + value.slice(end);
    const pos = start + snippet.length;
    el.focus();
    el.setSelectionRange(pos, pos);
  }

  function insertCodeBlock(el: HTMLTextAreaElement | null) {
    if (!el) return;
    const { selectionStart: start, selectionEnd: end, value } = el;
    const selected = value.slice(start, end);
    const body = selected || "code";
    const leadingNl = start > 0 && value[start - 1] !== "\n" ? "\n" : "";
    const snippet = "```" + `\n${body}\n` + "```\n";
    el.value = value.slice(0, start) + leadingNl + snippet + value.slice(end);
    el.focus();
    const codeStart = start + leadingNl.length + 4;
    el.setSelectionRange(codeStart, codeStart + body.length);
  }

  function insertLink(el: HTMLTextAreaElement | null) {
    if (!el) return;
    const { selectionStart: start, selectionEnd: end, value } = el;
    const text = value.slice(start, end) || "link text";
    const snippet = `[${text}](url)`;
    el.value = value.slice(0, start) + snippet + value.slice(end);
    el.focus();
    const urlStart = start + text.length + 3;
    el.setSelectionRange(urlStart, urlStart + 3);
  }

  /** Every helper above mutates `el.value` directly (uncontrolled, to keep
   *  cursor placement fast and simple) — none of that goes through React's
   *  onChange, so the word count, the live preview, and autosave would all
   *  go stale after a toolbar click, a keyboard shortcut, an image insert,
   *  or a rich paste. Call this after any of them touch the body field. */
  function notifyEdited(el: HTMLTextAreaElement | null) {
    if (el && el === bodyRef.current) setBodyText(el.value);
    scheduleAutosave();
  }

  const AUTO_PAIRS: Record<string, string> = { "(": ")", "[": "]", '"': '"', "'": "'" };
  const AUTO_CLOSERS = new Set(Object.values(AUTO_PAIRS));

  /** Everything a plain markdown textarea is missing next to a real editor:
   *  ⌘/Ctrl+B/I/K for the two most-reached-for marks and links, Enter that
   *  continues (or, on an empty item, exits) a bullet/numbered/checklist
   *  line, and auto-closing "() [] "" ''" so half-typed pairs don't linger
   *  unclosed in a diary entry nobody proofreads. */
  function handleBodyKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const mod = e.metaKey || e.ctrlKey;

    if (mod && !e.shiftKey && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === "b") {
        e.preventDefault();
        wrapSelection(el, "**", "**", "bold text");
        notifyEdited(el);
        return;
      }
      if (key === "i") {
        e.preventDefault();
        wrapSelection(el, "_", "_", "italic text");
        notifyEdited(el);
        return;
      }
      if (key === "k") {
        e.preventDefault();
        insertLink(el);
        notifyEdited(el);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !mod) {
      const { selectionStart: pos, value } = el;
      const lineStart = value.lastIndexOf("\n", pos - 1) + 1;
      const nextBreak = value.indexOf("\n", pos);
      const lineEnd = nextBreak === -1 ? value.length : nextBreak;
      const line = value.slice(lineStart, lineEnd);

      const checklist = line.match(/^(\s*)([-*+])\s\[[ xX]\]\s/);
      const bullet = !checklist ? line.match(/^(\s*)([-*+])\s/) : null;
      const ordered = !checklist && !bullet ? line.match(/^(\s*)(\d+)([.)])\s/) : null;
      const match = checklist ?? bullet ?? ordered;

      if (match) {
        e.preventDefault();
        const isEmptyItem = line.slice(match[0].length).trim() === "";
        if (isEmptyItem) {
          // Second Enter on a blank list line exits the list instead of
          // piling up empty bullets forever — same as GitHub/Notion/Typora.
          el.value = value.slice(0, lineStart) + value.slice(lineEnd);
          el.setSelectionRange(lineStart, lineStart);
        } else {
          const indent = match[1];
          const prefix = checklist
            ? `${indent}${checklist[2]} [ ] `
            : bullet
              ? `${indent}${bullet[2]} `
              : `${indent}${Number(ordered![2]) + 1}${ordered![3]} `;
          const insertion = `\n${prefix}`;
          el.value = value.slice(0, pos) + insertion + value.slice(pos);
          const newPos = pos + insertion.length;
          el.setSelectionRange(newPos, newPos);
        }
        el.focus();
        notifyEdited(el);
        return;
      }
    }

    if (!mod && !e.altKey && (e.key in AUTO_PAIRS || AUTO_CLOSERS.has(e.key))) {
      const { selectionStart: start, selectionEnd: end, value } = el;
      const hasSelection = start !== end;

      if (hasSelection && e.key in AUTO_PAIRS) {
        e.preventDefault();
        const close = AUTO_PAIRS[e.key];
        const selected = value.slice(start, end);
        el.value = value.slice(0, start) + e.key + selected + close + value.slice(end);
        el.setSelectionRange(start + 1, start + 1 + selected.length);
        el.focus();
        notifyEdited(el);
        return;
      }

      // Typing a closer right where one we already auto-inserted is
      // sitting — step over it instead of doubling up, e.g. `(text|)` + ")".
      if (!hasSelection && AUTO_CLOSERS.has(e.key) && value[start] === e.key) {
        e.preventDefault();
        el.setSelectionRange(start + 1, start + 1);
        return;
      }

      if (!hasSelection && e.key in AUTO_PAIRS) {
        e.preventDefault();
        const close = AUTO_PAIRS[e.key];
        el.value = value.slice(0, start) + e.key + close + value.slice(start);
        el.setSelectionRange(start + 1, start + 1);
        el.focus();
        notifyEdited(el);
        return;
      }
    }
  }

  async function ensureDraft() {
    if (draft) return draft;
    const created = await createDiaryDraft();
    setDraft(created);
    return created;
  }

  /** Writes the current fields to the draft note. Silent on failure — an
   *  autosave hiccup shouldn't interrupt writing; the explicit Save button
   *  (saveDiaryEntry) remains the source of truth and will retry the write. */
  async function autosaveDraft() {
    const body = bodyRef.current?.value ?? "";
    const scratch = scratchRef.current?.value ?? "";
    if (!body.trim() && !scratch.trim()) return;

    setDraftStatus("saving");
    try {
      const entry = await ensureDraft();
      await saveDiaryDraft({
        noteId: entry.noteId,
        title: titleRef.current?.value ?? "",
        body,
        scratch,
        occurredAt: occurredAtRef.current?.value ?? "",
        language: languageRef.current?.value ?? lang,
        mood,
        energy,
        tags: pickedTags,
      });
      setDraftStatus("saved");
    } catch {
      setDraftStatus("idle");
    }
  }

  /** Debounces autosave to 5s after the last change — every field edit
   *  (typing, mood/energy/tag clicks) restarts the timer. */
  function scheduleAutosave() {
    setDraftStatus("idle");
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(autosaveDraft, 5000);
  }

  // Mood/energy/tags are controlled React state (button clicks, not input
  // events), so they need their own trigger — text fields schedule via
  // onChange instead.
  useEffect(() => {
    scheduleAutosave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, energy, pickedTags]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  async function handleImage(file: File, target: HTMLTextAreaElement | null) {
    setError(null);
    setUploadPct(0);
    // Capture the caret before any async work — opening the file picker or
    // awaiting the upload moves focus, and selectionStart collapses to the
    // end by the time it resolves (same fix as the classroom composer).
    const insertStart = target?.selectionStart ?? target?.value.length ?? 0;
    const insertEnd = target?.selectionEnd ?? insertStart;

    try {
      const entry = await ensureDraft();
      const { provider, url } = await signAndUploadFile(entry.noteId, file, setUploadPct);
      await attachMediaAction(entry.noteId, entry.slug, {
        kind: mediaKindFromMimeType(file.type || "application/octet-stream"),
        provider,
        url,
        sizeBytes: file.size,
        mimeType: file.type || "application/octet-stream",
      });
      insertAtCursor(target, `\n![${file.name}](${url})\n`, insertStart, insertEnd);
      notifyEdited(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploadPct(null);
    }
  }

  /** Non-image attachments (PDF, Word, Excel, …) upload and attach like an
   *  image does, but insert as a file-card link rather than dumping their
   *  content into the entry — see extractPendingDoc for the opt-in pull. */
  async function handleDocument(file: File, target: HTMLTextAreaElement | null) {
    setError(null);
    setUploadPct(0);
    const insertStart = target?.selectionStart ?? target?.value.length ?? 0;
    const insertEnd = target?.selectionEnd ?? insertStart;

    try {
      const entry = await ensureDraft();
      const { provider, url } = await signAndUploadFile(entry.noteId, file, setUploadPct);
      await attachMediaAction(entry.noteId, entry.slug, {
        kind: mediaKindFromMimeType(file.type || "application/octet-stream"),
        provider,
        url,
        sizeBytes: file.size,
        mimeType: file.type || "application/octet-stream",
      });
      insertAtCursor(
        target,
        `\n[${file.name}](${url}) — ${formatBytes(file.size)}\n`,
        insertStart,
        insertEnd,
      );
      notifyEdited(target);
      if (target === bodyRef.current) {
        setPendingDocs((prev) => [...prev, { id: url, name: file.name, url }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "File upload failed");
    } finally {
      setUploadPct(null);
    }
  }

  /** The manual "Extract content" click — pulls the document's text (and
   *  tables, for spreadsheets) in at the cursor via the same server action
   *  the classroom composer uses, then drops it from the pending queue. */
  async function extractPendingDoc(doc: { id: string; name: string; url: string }) {
    setError(null);
    setExtractingId(doc.id);
    const el = bodyRef.current;
    const insertStart = el?.selectionStart ?? el?.value.length ?? 0;
    const insertEnd = el?.selectionEnd ?? insertStart;
    try {
      const { markdown } = await extractDocumentForComposer({ url: doc.url, filename: doc.name });
      insertAtCursor(el, `\n${markdown}\n`, insertStart, insertEnd);
      notifyEdited(el);
      setPendingDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setError(err instanceof Error ? `${s.extractFailed}: ${err.message}` : s.extractFailed);
    } finally {
      setExtractingId(null);
    }
  }

  async function handleFiles(files: File[], target: HTMLTextAreaElement | null) {
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        await handleImage(file, target);
      } else if (isDocFile(file)) {
        await handleDocument(file, target);
      } else {
        setError(`${s.unsupportedFile}: ${file.name}`);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function pasteHandler(target: () => HTMLTextAreaElement | null) {
    return (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length > 0) {
        e.preventDefault();
        handleFiles(files, target());
        return;
      }
      // Rich paste (a webpage, a doc) keeps its formatting by converting
      // the clipboard's HTML flavor to markdown — a bare textarea would
      // silently drop all of it.
      const html = e.clipboardData?.getData("text/html");
      if (html && html.trim()) {
        e.preventDefault();
        const el = target();
        const start = el?.selectionStart ?? el?.value.length ?? 0;
        const end = el?.selectionEnd ?? start;
        insertAtCursor(el, turndown.turndown(html).trim(), start, end);
        notifyEdited(el);
      }
    };
  }

  function toggleTag(slug: string) {
    setPickedTags((prev) =>
      prev.includes(slug) ? prev.filter((t) => t !== slug) : [...prev, slug],
    );
  }

  // Word/reading-time counter — counts CJK characters instead of
  // whitespace-split words once they outnumber them, since Chinese/Japanese
  // prose has no spaces between words and a word count of "3" for three
  // paragraphs would be useless.
  const trimmedBody = bodyText.trim();
  const wordCount = trimmedBody ? trimmedBody.split(/\s+/).length : 0;
  const cjkCharCount = (trimmedBody.match(/[一-鿿぀-ヿ가-힯]/g) ?? []).length;
  const isCjkHeavy = cjkCharCount > wordCount;
  const bodyCount = isCjkHeavy ? cjkCharCount : wordCount;
  const readingMinutes = bodyCount > 0 ? Math.max(1, Math.round(bodyCount / (isCjkHeavy ? 300 : 200))) : 0;

  return (
    <form
      action={saveDiaryEntry}
      onSubmit={() => {
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      }}
      className="flex flex-col gap-4"
    >
      {draft && <input type="hidden" name="noteId" value={draft.noteId} />}
      <input type="hidden" name="mood" value={mood} />
      <input type="hidden" name="energy" value={energy || ""} />
      <input type="hidden" name="tags" value={pickedTags.join(",")} />

      {/* Title is optional on purpose — left blank, a local model names the
          entry from its content after save. */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          ref={titleRef}
          type="text"
          name="title"
          placeholder={s.titlePlaceholder}
          onChange={scheduleAutosave}
          className="flex-[2] rounded-lg border border-border bg-bg-elevated px-4 py-2.5 text-lg text-fg outline-none placeholder:text-fg-secondary/70 focus:border-accent"
        />
        <input
          ref={occurredAtRef}
          type="datetime-local"
          name="occurredAt"
          defaultValue={localDateTimeValue(new Date(defaultOccurredAt))}
          onChange={scheduleAutosave}
          className="rounded-lg border border-border bg-bg-elevated px-3 py-2.5 text-sm text-fg outline-none focus:border-accent"
        />
        <select
          ref={languageRef}
          name="language"
          defaultValue={lang}
          aria-label={s.language}
          onChange={scheduleAutosave}
          className="rounded-lg border border-border bg-bg-elevated px-3 py-2.5 text-sm text-fg outline-none focus:border-accent"
        >
          <option value="en">EN</option>
          <option value="zh">中文</option>
        </select>
      </div>

      {/* Write/Preview tabs + formatting toolbar — the toolbar inserts
          markdown syntax at the cursor rather than rendering WYSIWYG, so
          the body stays a plain textarea (and plain `body` form field)
          underneath; Preview renders that markdown for real, first-line
          paragraph indents and all, so "is this a new paragraph" is never
          a guess. */}
      <div className="flex flex-wrap items-center justify-between gap-1 rounded-t-xl border border-b-0 border-border bg-bg-elevated px-2 py-1.5">
        <div className="flex gap-1">
          <TabButton active={bodyMode === "write"} onClick={() => setBodyMode("write")}>
            {s.tabWrite}
          </TabButton>
          <TabButton active={bodyMode === "preview"} onClick={() => setBodyMode("preview")}>
            {s.tabPreview}
          </TabButton>
        </div>
        {bodyMode === "write" && (
          <div className="flex flex-wrap gap-1">
            <ToolbarButton label="B" title={`${s.toolbarBold} (Ctrl/⌘+B)`} className="font-bold" onClick={() => { wrapSelection(bodyRef.current, "**", "**", "bold text"); notifyEdited(bodyRef.current); }} />
            <ToolbarButton label="I" title={`${s.toolbarItalic} (Ctrl/⌘+I)`} className="italic" onClick={() => { wrapSelection(bodyRef.current, "_", "_", "italic text"); notifyEdited(bodyRef.current); }} />
            <ToolbarDivider />
            <ToolbarButton label="H2" title={s.toolbarH2} onClick={() => { toggleLinePrefix(bodyRef.current, "## "); notifyEdited(bodyRef.current); }} />
            <ToolbarButton label="H3" title={s.toolbarH3} onClick={() => { toggleLinePrefix(bodyRef.current, "### "); notifyEdited(bodyRef.current); }} />
            <ToolbarDivider />
            <ToolbarButton label="―" title={s.toolbarDivider} onClick={() => { insertDivider(bodyRef.current); notifyEdited(bodyRef.current); }} />
            <ToolbarButton label="{ }" title={s.toolbarCode} onClick={() => { insertCodeBlock(bodyRef.current); notifyEdited(bodyRef.current); }} />
            <ToolbarDivider />
            <ToolbarButton label="≡" title={s.toolbarBulletList} onClick={() => { toggleLinePrefix(bodyRef.current, "- "); notifyEdited(bodyRef.current); }} />
            <ToolbarButton label="1." title={s.toolbarNumberedList} onClick={() => { toggleOrderedList(bodyRef.current); notifyEdited(bodyRef.current); }} />
            <ToolbarButton label="″" title={s.toolbarQuote} onClick={() => { toggleLinePrefix(bodyRef.current, "> "); notifyEdited(bodyRef.current); }} />
            <ToolbarButton label="☐" title={s.toolbarChecklist} onClick={() => { toggleLinePrefix(bodyRef.current, "- [ ] "); notifyEdited(bodyRef.current); }} />
            <ToolbarDivider />
            <ToolbarButton label="🔗" title={`${s.toolbarLink} (Ctrl/⌘+K)`} onClick={() => { insertLink(bodyRef.current); notifyEdited(bodyRef.current); }} />
            <ToolbarButton label="📎" title={s.attachFile} onClick={() => fileInputRef.current?.click()} />
          </div>
        )}
      </div>
      <textarea
        ref={bodyRef}
        name="body"
        autoFocus
        placeholder={s.bodyPlaceholder}
        onDragOver={(e) => {
          if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer?.files ?? []);
          if (files.length === 0) return;
          e.preventDefault();
          handleFiles(files, bodyRef.current);
        }}
        onPaste={pasteHandler(() => bodyRef.current)}
        onKeyDown={handleBodyKeyDown}
        onChange={(e) => {
          setBodyText(e.target.value);
          scheduleAutosave();
        }}
        className={`min-h-[42vh] flex-1 resize-y rounded-b-xl border border-border bg-bg-elevated p-5 font-serif text-[1.0625rem] leading-relaxed text-fg outline-none placeholder:text-fg-secondary/60 focus:border-accent ${bodyMode !== "write" ? "hidden" : ""}`}
      />
      {bodyMode === "preview" && (
        <div className="min-h-[42vh] flex-1 overflow-y-auto rounded-b-xl border border-border bg-bg-elevated p-5">
          {bodyText.trim() ? (
            <Markdown indentParagraphs>{bodyText}</Markdown>
          ) : (
            <p className="text-fg-secondary">{s.previewEmpty}</p>
          )}
        </div>
      )}

      {/* Attached documents default to a file-card link (see handleDocument)
          — their text only lands in the entry if you ask for it here, so
          dropping in a tax PDF doesn't silently turn the entry into the
          PDF's full contents. */}
      {pendingDocs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-bg-elevated px-3 py-2.5">
          <span className="text-xs text-fg-secondary">{s.docsAttachedHint}</span>
          {pendingDocs.map((doc) => (
            <span
              key={doc.id}
              className="flex items-center gap-1.5 rounded-full border border-border bg-bg pl-2.5 pr-1.5 py-1 text-xs"
            >
              📄 <span className="max-w-[10rem] truncate">{doc.name}</span>
              <button
                type="button"
                onClick={() => extractPendingDoc(doc)}
                disabled={extractingId === doc.id}
                className="rounded-full px-2 py-0.5 font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
              >
                {extractingId === doc.id ? s.extracting : s.extractContent}
              </button>
              <button
                type="button"
                onClick={() => setPendingDocs((prev) => prev.filter((d) => d.id !== doc.id))}
                aria-label={s.dismiss}
                title={s.dismiss}
                className="rounded-full px-1.5 text-fg-secondary hover:text-fg"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Scratch pad — collapsed by default so the main box stays the
          obvious place to write. Its content is mined for knowledge but
          never rendered as part of the entry. */}
      <div className="rounded-xl border border-dashed border-border">
        <button
          type="button"
          onClick={() => setShowScratch((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-fg-secondary hover:text-accent transition-colors"
        >
          <span className={`transition-transform ${showScratch ? "rotate-90" : ""}`}>›</span>
          ✂️ {s.scratchTitle}
          <span className="ml-auto text-xs font-normal opacity-70">{s.scratchHint}</span>
        </button>
        {showScratch && (
          <textarea
            ref={scratchRef}
            name="scratch"
            placeholder={s.scratchPlaceholder}
            onDragOver={(e) => {
              if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
            }}
            onDrop={(e) => {
              const files = Array.from(e.dataTransfer?.files ?? []);
              if (files.length === 0) return;
              e.preventDefault();
              handleFiles(files, scratchRef.current);
            }}
            onPaste={pasteHandler(() => scratchRef.current)}
            onChange={scheduleAutosave}
            className="min-h-[18vh] w-full resize-y rounded-b-xl border-t border-border bg-bg p-4 font-mono text-sm leading-relaxed text-fg outline-none placeholder:text-fg-secondary/60 focus:border-accent"
          />
        )}
      </div>

      {/* Mood + energy: one click each, both optional. These give the
          knowledge engine something to correlate life areas against. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-bg-elevated px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-fg-secondary">{s.mood}</span>
          {MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMood(mood === m.value ? "" : m.value)}
              aria-pressed={mood === m.value}
              title={m.value}
              className={`rounded-lg px-2 py-1 text-lg transition-all ${
                mood === m.value
                  ? "scale-110 bg-accent/15 ring-1 ring-accent"
                  : "opacity-50 hover:opacity-100"
              }`}
            >
              {m.emoji}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-fg-secondary">{s.energy}</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setEnergy(energy === n ? 0 : n)}
              aria-pressed={energy >= n}
              className={`h-6 w-3 rounded-sm transition-all ${
                energy >= n ? "bg-accent" : "bg-border hover:bg-fg-secondary/40"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Life-area tags. Leaving all unselected is the normal case — the
          auto-tagger fills them in from the content. */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-fg-secondary">{s.tagsHint}</span>
        <div className="flex flex-wrap gap-1.5">
          {LIFE_AREAS.map((area) => {
            const active = pickedTags.includes(area.slug);
            return (
              <button
                key={area.slug}
                type="button"
                onClick={() => toggleTag(area.slug)}
                aria-pressed={active}
                style={active ? { backgroundColor: area.color, borderColor: area.color } : undefined}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                  active
                    ? "text-white shadow-sm"
                    : "border-border text-fg-secondary hover:border-accent hover:text-accent"
                }`}
              >
                {area.emoji} {lang === "zh" ? area.labelZh : area.labelEn}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SaveButton lang={lang} />

        <label className="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors">
          {uploadPct !== null ? `${s.uploading} ${uploadPct}%` : `📎 ${s.attachFile}`}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xlsx,.xls,.csv,.pptx,.txt,.md,.markdown,.json"
            multiple
            className="hidden"
            disabled={uploadPct !== null}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) handleFiles(files, bodyRef.current);
            }}
          />
        </label>

        <span className="text-xs text-fg-secondary">
          {bodyCount > 0 &&
            `${bodyCount} ${isCjkHeavy ? s.charCount : s.wordCount} · ${readingMinutes} ${s.minRead} · `}
          {draftStatus === "saving" ? s.draftSaving : draftStatus === "saved" ? s.draftSaved : s.autoHint}
        </span>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </form>
  );
}

function SaveButton({ lang }: { lang: Lang }) {
  const { pending } = useFormStatus();
  const s = t(lang).diary;
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-accent px-5 py-2 font-semibold text-accent-fg hover:opacity-90 disabled:opacity-60 transition-opacity"
    >
      {pending ? s.saving : s.save}
    </button>
  );
}

function ToolbarButton({
  label,
  title,
  onClick,
  className = "",
}: {
  label: string;
  title: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`flex h-7 min-w-[1.75rem] items-center justify-center rounded-md px-1.5 text-sm text-fg-secondary hover:bg-bg hover:text-accent transition-colors ${className}`}
    >
      {label}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-0.5 my-1 w-px bg-border" aria-hidden />;
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
        active ? "bg-bg text-fg shadow-sm" : "text-fg-secondary hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}
