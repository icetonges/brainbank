import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  notes,
  noteContent,
  diaryEntries,
  noteTags,
  tags as tagsTable,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { LIFE_AREAS } from "@/lib/knowledge/taxonomy";
import { updateDiaryEntry } from "../../actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function localDateTimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function EditDiaryEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang: langParam } = await searchParams;
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/diary/${slug}/edit`);

  const lang = await getLang(langParam);
  const s = t(lang).diary;

  const note = await db.query.notes.findFirst({ where: eq(notes.slug, slug) });
  if (!note || note.sourceType !== "diary") notFound();

  const entry = await db.query.diaryEntries.findFirst({
    where: eq(diaryEntries.noteId, note.id),
  });
  if (!entry) notFound();

  const content = await db.query.noteContent.findFirst({
    where: and(eq(noteContent.noteId, note.id), eq(noteContent.language, note.primaryLanguage)),
  });

  const tagRows = await db
    .select({ name: tagsTable.name })
    .from(noteTags)
    .innerJoin(tagsTable, eq(noteTags.tagId, tagsTable.id))
    .where(eq(noteTags.noteId, note.id));

  const save = updateDiaryEntry.bind(null, note.id, slug);
  const inputClass =
    "rounded-lg border border-border bg-bg-elevated px-3 py-2 text-fg outline-none focus:border-accent";

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <h1 className="text-2xl font-semibold text-fg">{s.editTitle}</h1>

      <form action={save} className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input type="text" name="title" required defaultValue={note.title} className={`flex-[2] ${inputClass}`} />
          <input
            type="datetime-local"
            name="occurredAt"
            defaultValue={localDateTimeValue(entry.occurredAt)}
            className={`text-sm ${inputClass}`}
          />
        </div>

        <textarea
          name="body"
          defaultValue={content?.bodyMarkdown ?? ""}
          className="min-h-[40vh] resize-y rounded-xl border border-border bg-bg-elevated p-5 font-serif text-[1.0625rem] leading-relaxed text-fg outline-none focus:border-accent"
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg-secondary">✂️ {s.scratchTitle}</span>
          <textarea
            name="scratch"
            defaultValue={entry.scratch}
            className="min-h-[14vh] resize-y rounded-xl border border-dashed border-border bg-bg p-4 font-mono text-sm text-fg outline-none focus:border-accent"
          />
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm text-fg-secondary">{s.mood}</span>
            <select name="mood" defaultValue={entry.mood ?? ""} className={`text-sm ${inputClass}`}>
              <option value="">—</option>
              <option value="great">🤩 great</option>
              <option value="good">🙂 good</option>
              <option value="neutral">😐 neutral</option>
              <option value="low">😕 low</option>
              <option value="rough">😣 rough</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm text-fg-secondary">{s.energy}</span>
            <select name="energy" defaultValue={entry.energy ?? ""} className={`text-sm ${inputClass}`}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-[2] flex-col gap-1.5">
            <span className="text-sm text-fg-secondary">
              {s.tagsLabel}{" "}
              <span className="opacity-70">
                ({LIFE_AREAS.slice(0, 5).map((a) => a.slug).join(", ")}…)
              </span>
            </span>
            <input
              type="text"
              name="tags"
              defaultValue={tagRows.map((t) => t.name).join(", ")}
              placeholder="work, kids, side-project"
              className={`text-sm ${inputClass}`}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-fg-secondary">
          <input type="checkbox" name="redistill" defaultChecked className="accent-current" />
          {s.redistillOnSave}
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-accent px-5 py-2 font-semibold text-accent-fg hover:opacity-90 transition-opacity"
          >
            {s.saveChanges}
          </button>
          <a href={`/diary/${slug}?lang=${lang}`} className="text-sm text-fg-secondary hover:text-accent">
            {s.cancel}
          </a>
        </div>
      </form>
    </div>
  );
}
