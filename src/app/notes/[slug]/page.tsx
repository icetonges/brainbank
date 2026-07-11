import Link from "next/link";
import { db } from "@/lib/db";
import { notes, noteContent, noteTags, tags as tagsTable, media as mediaTable, ingestionJobs } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { renderWithWikilinks } from "@/lib/notes/render-wikilinks";
import { UploadWidget } from "@/components/upload-widget";
import { MediaGallery } from "@/components/media-gallery";
import { IngestStatusBanner } from "@/components/ingest-status-banner";
import {
  translateNoteAction,
  summarizeNoteAction,
  suggestTagsAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function NotePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang } = await searchParams;

  const note = await db.query.notes.findFirst({ where: eq(notes.slug, slug) });
  if (!note) notFound();

  const session = await auth();
  const language: "en" | "zh" = lang === "zh" ? "zh" : "en";
  const otherLanguage: "en" | "zh" = language === "en" ? "zh" : "en";

  const content = await db.query.noteContent.findFirst({
    where: and(eq(noteContent.noteId, note.id), eq(noteContent.language, language)),
  });

  const noteTagRows = await db
    .select({ name: tagsTable.name })
    .from(noteTags)
    .innerJoin(tagsTable, eq(noteTags.tagId, tagsTable.id))
    .where(eq(noteTags.noteId, note.id));

  // For resolving [[Wikilinks]] in the body text to real /notes/<slug> links.
  const allNotes = await db.select({ title: notes.title, slug: notes.slug }).from(notes);
  const titleToSlug = new Map(allNotes.map((n) => [n.title.toLowerCase(), n.slug]));

  const mediaRows = await db
    .select({
      id: mediaTable.id,
      kind: mediaTable.kind,
      url: mediaTable.url,
      mimeType: mediaTable.mimeType,
      sizeBytes: mediaTable.sizeBytes,
    })
    .from(mediaTable)
    .where(eq(mediaTable.noteId, note.id));

  const latestJob = await db.query.ingestionJobs.findFirst({
    where: eq(ingestionJobs.noteId, note.id),
    orderBy: desc(ingestionJobs.createdAt),
  });

  const translateAction = translateNoteAction.bind(null, note.id, slug, otherLanguage, undefined);
  const summarizeAction = summarizeNoteAction.bind(null, note.id, slug, language, undefined);
  const tagAction = suggestTagsAction.bind(null, note.id, slug, language, undefined);

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold text-fg">{note.title}</h1>
          <div className="flex shrink-0 gap-1 rounded-md border border-border p-1 text-sm">
            <Link
              href={`/notes/${slug}?lang=en`}
              className={`rounded px-2 py-1 ${language === "en" ? "bg-accent text-accent-fg" : "text-fg-secondary hover:text-accent"}`}
            >
              EN
            </Link>
            <Link
              href={`/notes/${slug}?lang=zh`}
              className={`rounded px-2 py-1 ${language === "zh" ? "bg-accent text-accent-fg" : "text-fg-secondary hover:text-accent"}`}
            >
              中文
            </Link>
          </div>
        </div>
        <p className="text-sm text-fg-secondary">
          {note.status} · {note.sourceType} ·{" "}
          {new Date(note.createdAt).toLocaleDateString()}
        </p>
        {noteTagRows.length > 0 && (
          <div className="flex flex-wrap gap-2">
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

      {latestJob && (latestJob.status === "queued" || latestJob.status === "running" || latestJob.status === "failed") && (
        <IngestStatusBanner
          noteId={note.id}
          slug={slug}
          initialStatus={latestJob.status}
          initialStage={latestJob.stage}
          initialError={latestJob.error}
        />
      )}

      {session && (
        <div className="flex flex-wrap gap-2 border-y border-border py-3">
          <form action={translateAction}>
            <ActionButton>
              {content
                ? `Re-translate to ${otherLanguage === "zh" ? "中文" : "English"}`
                : `Translate from ${otherLanguage === "zh" ? "中文" : "English"}`}
            </ActionButton>
          </form>
          <form action={summarizeAction}>
            <ActionButton disabled={!content}>Summarize</ActionButton>
          </form>
          <form action={tagAction}>
            <ActionButton disabled={!content}>Suggest tags</ActionButton>
          </form>
          <Link
            href="/graph"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg-secondary hover:border-accent hover:text-accent transition-colors"
          >
            View in graph
          </Link>
        </div>
      )}

      {!content && (
        <div className="rounded-lg border border-border bg-bg-elevated p-5 text-fg-secondary">
          No {language === "zh" ? "Chinese" : "English"} version yet.
          {session
            ? " Use “Translate” above to generate one from the other language."
            : ""}
        </div>
      )}

      {content?.summary && (
        <p className="rounded-lg border border-accent/40 bg-bg-elevated p-4 text-fg-secondary italic">
          {content.summary}
        </p>
      )}

      <Layer title="What" body={content?.what} titleToSlug={titleToSlug} />
      <Layer title="How" body={content?.how} titleToSlug={titleToSlug} />
      <Layer title="Why" body={content?.why} titleToSlug={titleToSlug} />
      <Layer title="Other" body={content?.other} titleToSlug={titleToSlug} />

      <MediaGallery items={mediaRows} slug={slug} canEdit={Boolean(session)} />

      {session && (
        <div className="rounded-lg border border-dashed border-border p-4">
          <UploadWidget noteId={note.id} slug={slug} />
        </div>
      )}
    </article>
  );
}

function ActionButton({
  children,
  disabled,
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-border disabled:hover:text-fg transition-colors"
    >
      {children}
    </button>
  );
}

function Layer({
  title,
  body,
  titleToSlug,
}: {
  title: string;
  body?: string | null;
  titleToSlug: Map<string, string>;
}) {
  if (!body) return null;
  return (
    <section className="rounded-lg border border-border bg-bg-elevated p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
        {title}
      </h2>
      <p className="mt-2 whitespace-pre-wrap text-fg">
        {renderWithWikilinks(body, titleToSlug)}
      </p>
    </section>
  );
}
