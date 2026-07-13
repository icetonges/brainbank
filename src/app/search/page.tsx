import Link from "next/link";
import { cookies } from "next/headers";
import { and, or, ilike, eq, inArray, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db, isDatabaseConfigured } from "@/lib/db";
import { notes, noteContent, noteTags, tags } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

async function search(q: string, isOwner: boolean) {
  const pattern = `%${q}%`;

  // The homepage's Topic index links to /search?q=<tag> for each #tag pill
  // — a tag name (e.g. "claude-code") rarely appears verbatim in a title or
  // body, so tag membership needs its own match path rather than
  // piggybacking on the content ilike below (that's why clicking a topic
  // pill used to come back empty even when the front page showed a count).
  const taggedRows = await db
    .select({ noteId: noteTags.noteId })
    .from(noteTags)
    .innerJoin(tags, eq(noteTags.tagId, tags.id))
    .where(ilike(tags.name, pattern));
  const taggedIds = taggedRows.map((r) => r.noteId);

  // AI Classroom articles keep their body in noteContent.bodyMarkdown
  // (what/how/why/other are only used by regular hand-written notes), so
  // that needed its own ilike too — otherwise classroom articles were only
  // ever matchable via their title or AI-generated summary.
  const contentMatch = or(
    ilike(notes.title, pattern),
    ilike(noteContent.bodyMarkdown, pattern),
    ilike(noteContent.what, pattern),
    ilike(noteContent.how, pattern),
    ilike(noteContent.why, pattern),
    ilike(noteContent.other, pattern),
    ilike(noteContent.summary, pattern),
  );

  const conditions = [
    taggedIds.length > 0 ? or(contentMatch, inArray(notes.id, taggedIds)) : contentMatch,
  ];
  if (!isOwner) conditions.push(eq(notes.status, "published"));

  const rows = await db
    .select({
      id: notes.id,
      slug: notes.slug,
      title: notes.title,
      status: notes.status,
      sourceType: notes.sourceType,
      category: notes.category,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .leftJoin(noteContent, eq(noteContent.noteId, notes.id))
    .where(and(...conditions))
    .orderBy(desc(notes.updatedAt));

  // The join can return the same note twice (once per language row) —
  // keep just the first (most-recently-updated-first, already sorted).
  const seen = new Set<number>();
  const deduped = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    deduped.push(row);
  }
  return deduped;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; lang?: string }>;
}) {
  const { q, lang: langParam } = await searchParams;
  const query = (q ?? "").trim();
  const session = await auth();

  const results = query && isDatabaseConfigured ? await search(query, Boolean(session)) : [];

  // Same lang-preference carry-through as the homepage (src/app/page.tsx) —
  // search results otherwise always link to the English version of a note
  // regardless of the header's EN/中文 toggle.
  const cookieStore = await cookies();
  const lang = langParam === "zh" ? "zh" : langParam === "en" ? "en" : cookieStore.get("lang")?.value === "zh" ? "zh" : "en";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg">Search</h1>
        <form action="/search" method="get" className="mt-3 flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={query}
            autoFocus
            placeholder="Search titles, what/how/why/other…"
            className="flex-1 rounded-md border border-border bg-bg-elevated px-3 py-2 text-fg outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 transition-opacity"
          >
            Search
          </button>
        </form>
      </div>

      {!query && (
        <p className="text-fg-secondary">Type something above to search your notes.</p>
      )}

      {query && results.length === 0 && (
        <p className="text-fg-secondary">
          No notes match &quot;{query}&quot;.
        </p>
      )}

      {results.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-bg-elevated">
          {results.map((note) => (
            <li key={note.id} className="p-5">
              <Link
                href={
                  note.category
                    ? `/classroom/${note.slug}?lang=${lang}`
                    : `/notes/${note.slug}?lang=${lang}`
                }
                className="text-lg font-medium text-fg hover:text-accent transition-colors"
              >
                {note.title}
              </Link>
              <div className="mt-1 text-sm text-fg-secondary">
                {note.status} · {note.sourceType} ·{" "}
                {new Date(note.updatedAt).toLocaleDateString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
