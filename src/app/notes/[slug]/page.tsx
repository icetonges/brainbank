import { db } from "@/lib/db";
import { notes, noteContent } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NotePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const note = await db.query.notes.findFirst({ where: eq(notes.slug, slug) });
  if (!note) notFound();

  const content = await db.query.noteContent.findFirst({
    where: and(eq(noteContent.noteId, note.id), eq(noteContent.language, "en")),
  });

  return (
    <article className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-semibold text-fg">{note.title}</h1>
        <p className="mt-1 text-sm text-fg-secondary">
          {note.status} · {note.sourceType} ·{" "}
          {new Date(note.createdAt).toLocaleDateString()}
        </p>
      </header>

      <Layer title="What" body={content?.what} />
      <Layer title="How" body={content?.how} />
      <Layer title="Why" body={content?.why} />
      <Layer title="Other" body={content?.other} />
    </article>
  );
}

function Layer({ title, body }: { title: string; body?: string | null }) {
  if (!body) return null;
  return (
    <section className="rounded-lg border border-border bg-bg-elevated p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
        {title}
      </h2>
      <p className="mt-2 whitespace-pre-wrap text-fg">{body}</p>
    </section>
  );
}
