import Link from "next/link";
import { db } from "@/lib/db";
import { notes, noteContent, noteTags, tags as tagsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { renderWithWikilinks } from "@/lib/notes/render-wikilinks";
import { formatDate } from "@/lib/date";

export const dynamic = "force-dynamic";

// Read-only viewer for any note that isn't a diary entry or a classroom
// article. The old "Knowledge" capture feature that used to live here —
// the +Knowledge nav button, /new (manual/URL/file ingestion), and this
// page's edit/translate/delete/AI-assist tooling — has been removed along
// with the knowledge pages it created.
//
// This page still has to exist, though: Obsidian-synced vault files (see
// src/lib/obsidian/persist.ts) are stored the same way those knowledge
// notes were (source_type set, category null) and still need somewhere to
// render, and [[wikilinks]]/the graph/search all resolve a generic note
// slug to this route. Diary and classroom notes redirect to their real
// pages below in case a wikilink or stale link ever points here for one.
export default async function NotePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang } = await searchParams;
  const language: "en" | "zh" = lang === "zh" ? "zh" : "en";

  const session = await auth();

  let note: typeof notes.$inferSelect | undefined;
  let content: typeof noteContent.$inferSelect | undefined;
  let noteTagRows: { name: string }[] = [];
  let titleToSlug = new Map<string, string>();
  let loadError = false;

  try {
    note = await db.query.notes.findFirst({ where: eq(notes.slug, slug) });
  } catch (err) {
    console.error(`Failed to load note "${slug}":`, err);
    loadError = true;
  }

  if (!loadError && !note) notFound();

  if (note?.sourceType === "diary") redirect(`/diary/${slug}`);
  if (note?.category) redirect(`/classroom/${slug}?lang=${language}`);

  if (loadError) {
    return (
      <div className="rounded-lg border border-danger/40 bg-bg-elevated p-5 text-fg-secondary">
        <p className="font-medium text-fg">Couldn&apos;t load this note.</p>
        <p className="mt-1 text-sm">The database didn&apos;t respond — reload to try again.</p>
      </div>
    );
  }

  // Public-read/private-edit model: anonymous visitors only ever see
  // published notes. The owner (signed in) can see everything.
  if (note!.status !== "published" && !session) notFound();

  try {
    content = await db.query.noteContent.findFirst({
      where: and(eq(noteContent.noteId, note!.id), eq(noteContent.language, language)),
    });

    noteTagRows = await db
      .select({ name: tagsTable.name })
      .from(noteTags)
      .innerJoin(tagsTable, eq(noteTags.tagId, tagsTable.id))
      .where(eq(noteTags.noteId, note!.id));

    // For resolving [[Wikilinks]] in the body text to real note links.
    const allNotes = await db.select({ title: notes.title, slug: notes.slug }).from(notes);
    titleToSlug = new Map(allNotes.map((n) => [n.title.toLowerCase(), n.slug]));
  } catch (err) {
    console.error(`Failed to load content for note "${slug}" (lang=${language}):`, err);
    return (
      <div className="rounded-lg border border-danger/40 bg-bg-elevated p-5 text-fg-secondary">
        <p className="font-medium text-fg">Couldn&apos;t load this note&apos;s content.</p>
        <p className="mt-1 text-sm">The database didn&apos;t respond — reload to try again.</p>
      </div>
    );
  }

  const n = note!;
  const otherLanguage: "en" | "zh" = language === "en" ? "zh" : "en";

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold text-fg">{n.title}</h1>
          <Link
            href={`/notes/${slug}?lang=${otherLanguage}`}
            className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm text-fg-secondary hover:border-accent hover:text-accent transition-colors"
          >
            {otherLanguage === "zh" ? "中文" : "EN"}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
          <span>{n.status}</span>
          <span aria-hidden="true">·</span>
          <span>{n.sourceType}</span>
          <span aria-hidden="true">·</span>
          <span>{formatDate(n.updatedAt)}</span>
        </div>
        {noteTagRows.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {noteTagRows.map((t) => (
              <span
                key={t.name}
                className="rounded-full border border-border px-2.5 py-0.5 text-xs text-fg-secondary"
              >
                #{t.name}
              </span>
            ))}
          </div>
        )}
      </header>

      {content ? (
        <div className="flex flex-col gap-6">
          <Field label="What" text={content.what} titleToSlug={titleToSlug} />
          <Field label="How" text={content.how} titleToSlug={titleToSlug} />
          <Field label="Why" text={content.why} titleToSlug={titleToSlug} />
          <Field label="Other" text={content.other} titleToSlug={titleToSlug} />
        </div>
      ) : (
        <p className="text-fg-secondary">No content in this language yet.</p>
      )}
    </article>
  );
}

function Field({
  label,
  text,
  titleToSlug,
}: {
  label: string;
  text: string | null | undefined;
  titleToSlug: Map<string, string>;
}) {
  if (!text?.trim()) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">{label}</h2>
      <p className="whitespace-pre-wrap leading-relaxed text-fg">
        {renderWithWikilinks(text, titleToSlug)}
      </p>
    </div>
  );
}
