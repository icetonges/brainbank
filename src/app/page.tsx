import Link from "next/link";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { db, isDatabaseConfigured } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function loadNotes(isOwner: boolean) {
  if (!isDatabaseConfigured) return { notes: [], error: "not-configured" as const };
  try {
    // Public-read/private-edit: anonymous visitors only ever see published
    // notes; the signed-in owner sees everything, including drafts still
    // being ingested and notes marked private.
    const rows = isOwner
      ? await db.select().from(notes).orderBy(desc(notes.updatedAt)).limit(50)
      : await db
          .select()
          .from(notes)
          .where(eq(notes.status, "published"))
          .orderBy(desc(notes.updatedAt))
          .limit(50);
    return { notes: rows, error: null };
  } catch {
    return { notes: [], error: "connection-failed" as const };
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const session = await auth();
  const { notes: rows, error } = await loadNotes(Boolean(session));

  // The header's EN/中文 toggle (src/components/language-toggle.tsx) sets
  // both a ?lang= query param on the current page and a `lang` cookie so
  // the preference survives navigation. The homepage doesn't have any
  // per-language content of its own (note titles aren't translated), but
  // it must carry the preference forward into each note link — otherwise
  // toggling language from here does nothing and every note opens in
  // English regardless of what was selected.
  const { lang: langParam } = await searchParams;
  const cookieStore = await cookies();
  const lang = langParam === "zh" ? "zh" : langParam === "en" ? "en" : cookieStore.get("lang")?.value === "zh" ? "zh" : "en";

  return (
    <div className="flex flex-1 flex-col gap-8">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">
          Your knowledge, connected.
        </h1>
        <p className="mt-2 max-w-2xl text-fg-secondary">
          Capture text, links, videos and documents. Each entry becomes a page
          structured as <span className="text-fg">what</span>,{" "}
          <span className="text-fg">how</span>, and{" "}
          <span className="text-fg">why</span> — connected to everything else
          you know.
        </p>
      </section>

      {error === "not-configured" && (
        <div className="rounded-lg border border-border bg-bg-elevated p-5 text-fg-secondary">
          <p className="font-medium text-fg">Database not connected yet.</p>
          <p className="mt-1 text-sm">
            Set <code className="text-accent">DATABASE_URL</code> in{" "}
            <code className="text-accent">.env.local</code> to a Neon Postgres
            connection string, then run the migrations. See{" "}
            <code className="text-accent">SETUP.md</code>.
          </p>
        </div>
      )}

      {error === "connection-failed" && (
        <div className="rounded-lg border border-danger/40 bg-bg-elevated p-5 text-fg-secondary">
          <p className="font-medium text-fg">Couldn&apos;t reach the database.</p>
          <p className="mt-1 text-sm">
            Double-check <code className="text-accent">DATABASE_URL</code> and
            that migrations have been run.
          </p>
        </div>
      )}

      {!error && rows.length === 0 && (
        <div className="rounded-lg border border-border bg-bg-elevated p-5 text-fg-secondary">
          No notes yet.{" "}
          <Link href="/new" className="text-accent hover:underline">
            Create your first one
          </Link>
          .
        </div>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-bg-elevated">
          {rows.map((note) => (
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
