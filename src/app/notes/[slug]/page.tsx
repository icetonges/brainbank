import Link from "next/link";
import { db } from "@/lib/db";
import { notes, noteContent, noteTags, tags as tagsTable, media as mediaTable, ingestionJobs } from "@/lib/db/schema";
import type { NoteStatus } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { renderWithWikilinks } from "@/lib/notes/render-wikilinks";
import { UploadWidget } from "@/components/upload-widget";
import { MediaGallery } from "@/components/media-gallery";
import { IngestStatusBanner } from "@/components/ingest-status-banner";
import { DeleteNoteButton } from "@/components/delete-note-button";
import { formatDate } from "@/lib/date";
import {
  translateNoteAction,
  summarizeNoteAction,
  suggestTagsAction,
  updateNoteStatusAction,
} from "./actions";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS: NoteStatus[] = ["draft", "published", "private"];

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
  const otherLanguage: "en" | "zh" = language === "en" ? "zh" : "en";

  const session = await auth();

  // Wrapped like the homepage/search pages: a transient DB hiccup (Neon
  // cold start, connection reset, etc.) should degrade to a visible retry
  // message, not an uncaught exception that takes down the whole page (see
  // src/app/error.tsx for the last-resort net if something still slips
  // through — but that shouldn't be the normal path for a query failure).
  let note: typeof notes.$inferSelect | undefined;
  let content: typeof noteContent.$inferSelect | undefined;
  let noteTagRows: { name: string }[] = [];
  let titleToSlug = new Map<string, string>();
  let mediaRows: {
    id: number;
    kind: (typeof mediaTable.$inferSelect)["kind"];
    url: string;
    mimeType: string | null;
    sizeBytes: number | null;
  }[] = [];
  let latestJob: typeof ingestionJobs.$inferSelect | undefined;
  let loadError = false;

  try {
    note = await db.query.notes.findFirst({ where: eq(notes.slug, slug) });
  } catch (err) {
    console.error(`Failed to load note "${slug}":`, err);
    loadError = true;
  }

  if (!loadError && !note) notFound();

  if (loadError) {
    return (
      <div className="rounded-lg border border-danger/40 bg-bg-elevated p-5 text-fg-secondary">
        <p className="font-medium text-fg">Couldn&apos;t load this note.</p>
        <p className="mt-1 text-sm">The database didn&apos;t respond — reload to try again.</p>
      </div>
    );
  }

  // Public-read/private-edit model: anonymous visitors only ever see
  // published notes. The owner (signed in) can see everything, including
  // drafts still being ingested and notes marked private.
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

    // For resolving [[Wikilinks]] in the body text to real /notes/<slug> links.
    const allNotes = await db.select({ title: notes.title, slug: notes.slug }).from(notes);
    titleToSlug = new Map(allNotes.map((n) => [n.title.toLowerCase(), n.slug]));

    mediaRows = await db
      .select({
        id: mediaTable.id,
        kind: mediaTable.kind,
        url: mediaTable.url,
        mimeType: mediaTable.mimeType,
        sizeBytes: mediaTable.sizeBytes,
      })
      .from(mediaTable)
      .where(eq(mediaTable.noteId, note!.id));

    latestJob = await db.query.ingestionJobs.findFirst({
      where: eq(ingestionJobs.noteId, note!.id),
      orderBy: desc(ingestionJobs.createdAt),
    });
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
  const translateAction = translateNoteAction.bind(null, n.id, slug, otherLanguage, undefined);
  const summarizeAction = summarizeNoteAction.bind(null, n.id, slug, language, undefined);
  const tagAction = suggestTagsAction.bind(null, n.id, slug, language, undefined);

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold text-fg">{n.title}</h1>
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
          {n.status} · {n.sourceType} ·{" "}
          {formatDate(n.createdAt)}
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
          noteId={n.id}
          slug={slug}
          initialStatus={latestJob.status}
          initialStage={latestJob.stage}
          initialError={latestJob.error}
        />
      )}

      {session && (
        <div className="flex flex-wrap items-center gap-2 border-y border-border py-3">
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
            href={`/notes/${slug}/edit?lang=${language}`}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors"
          >
            Edit
          </Link>
          <Link
            href="/graph"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg-secondary hover:border-accent hover:text-accent transition-colors"
          >
            View in graph
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <StatusControl noteId={n.id} slug={slug} current={n.status} />
            <DeleteNoteButton noteId={n.id} title={n.title} />
          </div>
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
          <UploadWidget noteId={n.id} slug={slug} />
        </div>
      )}
    </article>
  );
}

function StatusControl({
  noteId,
  slug,
  current,
}: {
  noteId: number;
  slug: string;
  current: NoteStatus;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border p-1 text-xs">
      {STATUS_OPTIONS.map((status) => {
        const action = updateNoteStatusAction.bind(null, noteId, slug, status);
        const active = status === current;
        return (
          <form action={action} key={status}>
            <button
              type="submit"
              disabled={active}
              title={`Mark as ${status}`}
              className={`rounded px-2 py-1 font-medium capitalize transition-colors ${
                active
                  ? "bg-accent text-accent-fg"
                  : "text-fg-secondary hover:text-accent"
              }`}
            >
              {status}
            </button>
          </form>
        );
      })}
    </div>
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
