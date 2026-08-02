"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import TurndownService from "turndown";
import { signAndUploadFile } from "@/lib/upload-client";
import { mediaKindFromMimeType } from "@/lib/storage/media-kind";
import { attachMediaAction } from "@/app/notes/[slug]/actions";
import { createDiaryDraft, saveDiaryEntry } from "@/app/diary/actions";
import { LIFE_AREAS } from "@/lib/knowledge/taxonomy";
import { t, type Lang } from "@/lib/i18n";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  fence: "```",
  bulletListMarker: "-",
});

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<{ noteId: number; slug: string } | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mood, setMood] = useState<string>("");
  const [energy, setEnergy] = useState<number>(0);
  const [pickedTags, setPickedTags] = useState<string[]>([]);
  const [showScratch, setShowScratch] = useState(false);

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

  async function ensureDraft() {
    if (draft) return draft;
    const created = await createDiaryDraft();
    setDraft(created);
    return created;
  }

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploadPct(null);
    }
  }

  async function handleFiles(files: File[], target: HTMLTextAreaElement | null) {
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        await handleImage(file, target);
      } else {
        setError(`${s.imagesOnly}: ${file.name}`);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function pasteHandler(target: () => HTMLTextAreaElement | null) {
    return (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.some((f) => f.type.startsWith("image/"))) {
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
      }
    };
  }

  function toggleTag(slug: string) {
    setPickedTags((prev) =>
      prev.includes(slug) ? prev.filter((t) => t !== slug) : [...prev, slug],
    );
  }

  return (
    <form action={saveDiaryEntry} className="flex flex-col gap-4">
      {draft && <input type="hidden" name="noteId" value={draft.noteId} />}
      <input type="hidden" name="mood" value={mood} />
      <input type="hidden" name="energy" value={energy || ""} />
      <input type="hidden" name="tags" value={pickedTags.join(",")} />

      {/* Title is optional on purpose — left blank, a local model names the
          entry from its content after save. */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          name="title"
          placeholder={s.titlePlaceholder}
          className="flex-[2] rounded-lg border border-border bg-bg-elevated px-4 py-2.5 text-lg text-fg outline-none placeholder:text-fg-secondary/70 focus:border-accent"
        />
        <input
          type="datetime-local"
          name="occurredAt"
          defaultValue={localDateTimeValue(new Date(defaultOccurredAt))}
          className="rounded-lg border border-border bg-bg-elevated px-3 py-2.5 text-sm text-fg outline-none focus:border-accent"
        />
        <select
          name="language"
          defaultValue={lang}
          aria-label={s.language}
          className="rounded-lg border border-border bg-bg-elevated px-3 py-2.5 text-sm text-fg outline-none focus:border-accent"
        >
          <option value="en">EN</option>
          <option value="zh">中文</option>
        </select>
      </div>

      {/* Formatting toolbar — inserts markdown syntax at the cursor rather
          than rendering WYSIWYG, so the body stays a plain textarea (and
          plain `body` form field) underneath. */}
      <div className="flex flex-wrap gap-1 rounded-t-xl border border-b-0 border-border bg-bg-elevated px-2 py-1.5">
        <ToolbarButton label="B" title={s.toolbarBold} className="font-bold" onClick={() => wrapSelection(bodyRef.current, "**", "**", "bold text")} />
        <ToolbarButton label="I" title={s.toolbarItalic} className="italic" onClick={() => wrapSelection(bodyRef.current, "_", "_", "italic text")} />
        <ToolbarDivider />
        <ToolbarButton label="H2" title={s.toolbarH2} onClick={() => toggleLinePrefix(bodyRef.current, "## ")} />
        <ToolbarButton label="H3" title={s.toolbarH3} onClick={() => toggleLinePrefix(bodyRef.current, "### ")} />
        <ToolbarDivider />
        <ToolbarButton label="―" title={s.toolbarDivider} onClick={() => insertDivider(bodyRef.current)} />
        <ToolbarButton label="{ }" title={s.toolbarCode} onClick={() => insertCodeBlock(bodyRef.current)} />
        <ToolbarDivider />
        <ToolbarButton label="≡" title={s.toolbarBulletList} onClick={() => toggleLinePrefix(bodyRef.current, "- ")} />
        <ToolbarButton label="1." title={s.toolbarNumberedList} onClick={() => toggleOrderedList(bodyRef.current)} />
        <ToolbarButton label="″" title={s.toolbarQuote} onClick={() => toggleLinePrefix(bodyRef.current, "> ")} />
        <ToolbarButton label="☐" title={s.toolbarChecklist} onClick={() => toggleLinePrefix(bodyRef.current, "- [ ] ")} />
        <ToolbarDivider />
        <ToolbarButton label="🔗" title={s.toolbarLink} onClick={() => insertLink(bodyRef.current)} />
        <ToolbarButton label="🖼" title={s.addImage} onClick={() => fileInputRef.current?.click()} />
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
        className="min-h-[42vh] flex-1 resize-y rounded-b-xl border border-border bg-bg-elevated p-5 font-serif text-[1.0625rem] leading-relaxed text-fg outline-none placeholder:text-fg-secondary/60 focus:border-accent"
      />

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
          {uploadPct !== null ? `${s.uploading} ${uploadPct}%` : `🖼 ${s.addImage}`}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={uploadPct !== null}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) handleFiles(files, bodyRef.current);
            }}
          />
        </label>

        <span className="text-xs text-fg-secondary">{s.autoHint}</span>
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
