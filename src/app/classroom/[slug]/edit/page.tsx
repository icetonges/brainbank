import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { notes, noteContent } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { CLASSROOM_TABS } from "@/lib/classroom";
import { getLang } from "@/lib/i18n-server";
import { t, CLASSROOM_TAB_LABELS_ZH } from "@/lib/i18n";
import { updateClassroomArticle } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditClassroomArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang: langParam } = await searchParams;
  const session = await auth();
  if (!session) redirect("/login");

  const lang = await getLang(langParam);
  const s = t(lang).classroom;

  const note = await db.query.notes.findFirst({ where: eq(notes.slug, slug) });
  if (!note || !note.category) notFound();

  // Edits target the original (primary-language) body — see
  // updateClassroomArticle in ../actions.ts.
  const content = await db.query.noteContent.findFirst({
    where: and(eq(noteContent.noteId, note.id), eq(noteContent.language, note.primaryLanguage)),
  });

  const save = updateClassroomArticle.bind(null, note.id, slug);

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="text-2xl font-semibold text-fg">{s.editTitle}</h1>

      <form action={save} className="flex min-h-[70vh] flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            name="topic"
            required
            defaultValue={note.title}
            className="flex-1 rounded-md border border-border bg-bg-elevated px-3 py-2 text-fg outline-none focus:border-accent"
          />
          <select
            name="category"
            defaultValue={note.category}
            className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          >
            {CLASSROOM_TABS.map((c) => (
              <option key={c.value} value={c.value}>
                {lang === "zh" ? CLASSROOM_TAB_LABELS_ZH[c.value] : c.label}
              </option>
            ))}
          </select>
        </div>

        <textarea
          name="body"
          defaultValue={content?.bodyMarkdown ?? ""}
          className="min-h-[55vh] flex-1 resize-y rounded-lg border border-border bg-bg-elevated p-4 font-mono text-sm leading-relaxed text-fg outline-none focus:border-accent"
        />

        <label className="flex items-center gap-2 text-sm text-fg-secondary">
          <input type="checkbox" name="regenerate" className="accent-current" />
          {s.regenerateOnSave}
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-accent px-5 py-2 font-semibold text-accent-fg hover:opacity-90 transition-opacity"
          >
            {s.saveChanges}
          </button>
          <a
            href={`/classroom/${slug}?lang=${lang}`}
            className="text-sm text-fg-secondary hover:text-accent"
          >
            {s.cancel}
          </a>
        </div>
      </form>
    </div>
  );
}
