import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { notes, noteContent, classroomSubcategories, classroomSections } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { auth } from "@/auth";
import { CLASSROOM_TABS } from "@/lib/classroom";
import { getLang } from "@/lib/i18n-server";
import { t, CLASSROOM_TAB_LABELS_ZH } from "@/lib/i18n";
import { SubcategoryField } from "@/components/subcategory-field";
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

  let subcategories: { id: number; name: string }[] = [];
  let sections: { id: number; name: string; subcategoryId: number }[] = [];
  try {
    subcategories = await db
      .select({ id: classroomSubcategories.id, name: classroomSubcategories.name })
      .from(classroomSubcategories)
      .orderBy(asc(classroomSubcategories.name));
    sections = await db
      .select({
        id: classroomSections.id,
        name: classroomSections.name,
        subcategoryId: classroomSections.subcategoryId,
      })
      .from(classroomSections)
      .orderBy(asc(classroomSections.sortOrder), asc(classroomSections.name));
  } catch (err) {
    console.error("Failed to load subcategories/sections:", err);
  }

  const save = updateClassroomArticle.bind(null, note.id, slug);
  const selectClass =
    "rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-fg outline-none focus:border-accent";

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="text-2xl font-semibold text-fg">{s.editTitle}</h1>

      <form action={save} className="flex min-h-[70vh] flex-col gap-4">
        <input
          type="text"
          name="topic"
          required
          defaultValue={note.title}
          className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-fg outline-none focus:border-accent"
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <select
            name="category"
            defaultValue={note.category}
            className={`flex-1 ${selectClass} sm:min-w-[160px]`}
          >
            {CLASSROOM_TABS.map((c) => (
              <option key={c.value} value={c.value}>
                {lang === "zh" ? CLASSROOM_TAB_LABELS_ZH[c.value] : c.label}
              </option>
            ))}
          </select>
          <SubcategoryField
            options={subcategories}
            sections={sections}
            defaultId={note.subcategoryId}
            defaultSectionId={note.sectionId}
            className={selectClass}
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
