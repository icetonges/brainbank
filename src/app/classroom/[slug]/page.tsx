import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  notes,
  noteContent,
  noteTags,
  tags as tagsTable,
  learningGuides,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { CLASSROOM_TAB_LABELS } from "@/lib/classroom";
import { Markdown } from "@/components/markdown";
import { DeleteArticleButton } from "@/components/delete-article-button";
import { regenerateGuideAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ClassroomArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();

  let note: typeof notes.$inferSelect | undefined;
  let content: typeof noteContent.$inferSelect | undefined;
  let guide: typeof learningGuides.$inferSelect | undefined;
  let tagRows: { name: string }[] = [];

  try {
    note = await db.query.notes.findFirst({ where: eq(notes.slug, slug) });
    if (note) {
      content = await db.query.noteContent.findFirst({
        where: and(eq(noteContent.noteId, note.id), eq(noteContent.language, "en")),
      });
      guide = await db.query.learningGuides.findFirst({
        where: eq(learningGuides.noteId, note.id),
      });
      tagRows = await db
        .select({ name: tagsTable.name })
        .from(noteTags)
        .innerJoin(tagsTable, eq(noteTags.tagId, tagsTable.id))
        .where(eq(noteTags.noteId, note.id));
    }
  } catch (err) {
    console.error(`Failed to load classroom article "${slug}":`, err);
    return (
      <div className="rounded-lg border border-danger/40 bg-bg-elevated p-5 text-fg-secondary">
        <p className="font-medium text-fg">Couldn&apos;t load this article.</p>
        <p className="mt-1 text-sm">The database didn&apos;t respond — reload to try again.</p>
      </div>
    );
  }

  if (!note || !note.category) notFound();
  if (note.status !== "published" && !session) notFound();

  const regenerate = regenerateGuideAction.bind(null, note.id, slug);

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/classroom" className="text-fg-secondary hover:text-accent">
            AI Classroom
          </Link>
          <span className="text-fg-secondary">/</span>
          <Link
            href={`/classroom?tab=${note.category}`}
            className="rounded-full border border-accent/50 px-2.5 py-0.5 text-xs font-medium text-accent hover:bg-accent hover:text-accent-fg transition-colors"
          >
            {CLASSROOM_TAB_LABELS[note.category]}
          </Link>
        </div>

        <h1 className="text-3xl font-semibold text-fg">{note.title}</h1>
        <p className="text-sm text-fg-secondary">
          {new Date(note.createdAt).toLocaleString()}
          {note.updatedAt.getTime() !== note.createdAt.getTime()
            ? ` · updated ${new Date(note.updatedAt).toLocaleString()}`
            : ""}
        </p>

        {tagRows.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tagRows.map((t) => (
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

      {session && (
        <div className="flex flex-wrap items-center gap-2 border-y border-border py-3">
          <Link
            href={`/classroom/${slug}/edit`}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors"
          >
            Edit
          </Link>
          <form action={regenerate}>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors"
            >
              {guide ? "Regenerate AI guide" : "Generate AI guide"}
            </button>
          </form>
          <div className="ml-auto">
            <DeleteArticleButton noteId={note.id} title={note.title} />
          </div>
        </div>
      )}

      {content?.summary && (
        <p className="rounded-lg border border-accent/40 bg-bg-elevated p-4 italic text-fg-secondary">
          {content.summary}
        </p>
      )}

      {content?.bodyMarkdown && (
        <section className="rounded-lg border border-border bg-bg-elevated p-5">
          <Markdown>{content.bodyMarkdown}</Markdown>
        </section>
      )}

      {guide ? (
        <>
          <GuideSection title="Learning map">
            <Markdown>{guide.learningMap}</Markdown>
          </GuideSection>

          <GuideSection title="Get hands-on — step by step">
            <Markdown>{guide.handsOn}</Markdown>
          </GuideSection>

          <GuideSection title="Top 3 sources">
            <ol className="flex flex-col gap-3">
              {guide.resources.map((r, i) => (
                <li key={r.url} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">
                    {i + 1}
                  </span>
                  <div>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-accent underline underline-offset-2 hover:opacity-80"
                    >
                      {r.title}
                    </a>
                    <p className="text-sm text-fg-secondary">{r.description}</p>
                    <p className="break-all text-xs text-fg-secondary/70">{r.url}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-fg-secondary">
              Links are AI-suggested — worth a quick sanity check before diving in.
            </p>
          </GuideSection>
        </>
      ) : (
        session && (
          <div className="rounded-lg border border-dashed border-border p-5 text-fg-secondary">
            No AI guide yet — use &quot;Generate AI guide&quot; above to build the
            learning map, hands-on steps, and top sources.
          </div>
        )
      )}
    </article>
  );
}

function GuideSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-bg-elevated p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-accent">
        {title}
      </h2>
      {children}
    </section>
  );
}
