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
        className="min-h-[42vh] flex-1 resize-y rounded-xl border border-border bg-bg-elevated p-5 font-serif text-[1.0625rem] leading-relaxed text-fg outline-none placeholder:text-fg-secondary/60 focus:border-accent"
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
