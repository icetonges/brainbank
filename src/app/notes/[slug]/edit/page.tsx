import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notes, noteContent } from "@/lib/db/schema";
import { updateNoteAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang } = await searchParams;

  const session = await auth();
  if (!session) redirect(`/notes/${slug}`);

  const note = await db.query.notes.findFirst({ where: eq(notes.slug, slug) });
  if (!note) notFound();

  const language: "en" | "zh" = lang === "zh" ? "zh" : "en";
  const content = await db.query.noteContent.findFirst({
    where: and(eq(noteContent.noteId, note.id), eq(noteContent.language, language)),
  });

  const action = updateNoteAction.bind(null, note.id, slug, language);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Link
          href={`/notes/${slug}?lang=${language}`}
          className="text-sm text-fg-secondary hover:text-accent"
        >
          ← Back to note
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-fg">
          Edit &middot; {language === "zh" ? "中文" : "English"}
        </h1>
        <p className="mt-1 text-fg-secondary">
          Editing the {language === "zh" ? "Chinese" : "English"} version.
          Write <code className="text-accent">[[Another Note&apos;s Title]]</code>{" "}
          anywhere to link it in the graph. The URL slug stays the same even
          if you change the title, so existing links keep working.
        </p>
      </div>

      <form action={action} className="flex flex-col gap-5">
        <Field label="Title" name="title" defaultValue={note.title} required />
        <Field label="What (the concept or fact)" name="what" defaultValue={content?.what} textarea />
        <Field label="How (mechanism / steps to apply it)" name="how" defaultValue={content?.how} textarea />
        <Field label="Why (context / reasoning)" name="why" defaultValue={content?.why} textarea />
        <Field label="Other (sources, open questions)" name="other" defaultValue={content?.other} textarea />

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 font-semibold text-accent-fg hover:opacity-90 transition-opacity"
          >
            Save changes
          </button>
          <Link
            href={`/notes/${slug}?lang=${language}`}
            className="rounded-md border border-border px-4 py-2 font-medium text-fg-secondary hover:border-accent hover:text-accent transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  required,
  textarea,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  textarea?: boolean;
  defaultValue?: string | null;
}) {
  const className =
    "rounded-md border border-border bg-bg-elevated px-3 py-2 text-fg outline-none focus:border-accent";
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-fg-secondary">
        {label}
      </label>
      {textarea ? (
        <textarea
          id={name}
          name={name}
          rows={5}
          defaultValue={defaultValue ?? ""}
          className={className}
        />
      ) : (
        <input
          id={name}
          name={name}
          required={required}
          defaultValue={defaultValue ?? ""}
          className={className}
        />
      )}
    </div>
  );
}
