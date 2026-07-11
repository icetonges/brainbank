import Link from "next/link";
import { cookies } from "next/headers";
import { and, or, ilike, eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db, isDatabaseConfigured } from "@/lib/db";
import { notes, noteContent } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

async function search(q: string, isOwner: boolean) {
  const pattern = `%${q}%`;

  const conditions = [
    or(
      ilike(notes.title, pattern),
      ilike(noteContent.what, pattern),
      ilike(noteContent.how, pattern),
      ilike(noteContent.why, pattern),
      ilike(noteContent.other, pattern),
      ilike(noteContent.summary, pattern),
    ),
  ];
  if (!isOwner) conditions.push(eq(notes.status, "published"));

  const rows = await db
    .select({
      id: notes.id,
      slug: notes.slug,
      title: notes.title,
      status: notes.status,
      sourceType: notes.sourceType,
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
                href={`/notes/${note.slug}?lang=${lang}`}
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
