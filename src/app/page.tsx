import Link from "next/link";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { db, isDatabaseConfigured } from "@/lib/db";
import { notes, edges, tags, noteTags } from "@/lib/db/schema";
import type { ClassroomCategory } from "@/lib/db/schema";
import { CLASSROOM_TABS } from "@/lib/classroom";
import { desc, eq, and, isNotNull, isNull, count } from "drizzle-orm";
import { HeroVisual, PillarIcon, CategoryGlyph } from "@/components/home-visuals";

export const dynamic = "force-dynamic";

interface HomeData {
  stats: { pages: number; articles: number; connections: number; topics: number };
  categoryCounts: Map<ClassroomCategory, number>;
  latestArticles: { slug: string; title: string; category: ClassroomCategory | null; createdAt: Date }[];
  recentNotes: { id: number; slug: string; title: string; status: string; sourceType: string; updatedAt: Date }[];
  topTags: { name: string; uses: number }[];
}

async function loadHome(isOwner: boolean): Promise<{ data: HomeData | null; error: "not-configured" | "connection-failed" | null }> {
  if (!isDatabaseConfigured) return { data: null, error: "not-configured" };
  try {
    // Public-read/private-edit: anonymous visitors only see published pages.
    const visible = isOwner ? undefined : eq(notes.status, "published");

    const [pageCount] = await db.select({ n: count() }).from(notes).where(visible);
    const [edgeCount] = await db.select({ n: count() }).from(edges);
    const [tagCount] = await db.select({ n: count() }).from(tags);

    const catRows = await db
      .select({ category: notes.category, n: count() })
      .from(notes)
      .where(visible ? and(isNotNull(notes.category), visible) : isNotNull(notes.category))
      .groupBy(notes.category);
    const categoryCounts = new Map<ClassroomCategory, number>();
    let articles = 0;
    for (const r of catRows) {
      if (r.category) {
        categoryCounts.set(r.category, r.n);
        articles += r.n;
      }
    }

    const latestArticles = await db
      .select({ slug: notes.slug, title: notes.title, category: notes.category, createdAt: notes.createdAt })
      .from(notes)
      .where(visible ? and(isNotNull(notes.category), visible) : isNotNull(notes.category))
      .orderBy(desc(notes.createdAt))
      .limit(5);

    const recentNotes = await db
      .select({
        id: notes.id,
        slug: notes.slug,
        title: notes.title,
        status: notes.status,
        sourceType: notes.sourceType,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .where(visible ? and(isNull(notes.category), visible) : isNull(notes.category))
      .orderBy(desc(notes.updatedAt))
      .limit(8);

    const topTags = await db
      .select({ name: tags.name, uses: count(noteTags.noteId) })
      .from(tags)
      .innerJoin(noteTags, eq(noteTags.tagId, tags.id))
      .groupBy(tags.name)
      .orderBy(desc(count(noteTags.noteId)))
      .limit(16);

    return {
      data: {
        stats: { pages: pageCount.n, articles, connections: edgeCount.n, topics: tagCount.n },
        categoryCounts,
        latestArticles,
        recentNotes,
        topTags,
      },
      error: null,
    };
  } catch (err) {
    console.error("Failed to load homepage data:", err);
    return { data: null, error: "connection-failed" };
  }
}

const PILLARS = [
  {
    kind: "ai" as const,
    title: "AI knowledge",
    body: "Concepts, models, MCP, APIs, and evaluation — captured from articles, videos, and documents, then distilled into structured pages with learning maps and hands-on steps.",
    href: "/classroom",
    cta: "Open the AI Classroom",
  },
  {
    kind: "km" as const,
    title: "Knowledge management",
    body: "Every capture becomes a connected page — what, how, why — linked into a living graph so insight compounds instead of scattering across bookmarks and folders.",
    href: "/graph",
    cta: "Explore the graph",
  },
  {
    kind: "cm" as const,
    title: "Change management",
    body: "Adopting AI is an organizational journey. Track best practices, use cases, and step-by-step playbooks that turn understanding into durable working habits.",
    href: "/classroom?tab=best-practices",
    cta: "Browse the playbooks",
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const session = await auth();
  const { data, error } = await loadHome(Boolean(session));

  // Carry the header's EN/中文 preference into note links (see
  // language-toggle.tsx) — same behavior as the previous homepage.
  const { lang: langParam } = await searchParams;
  const cookieStore = await cookies();
  const lang =
    langParam === "zh" ? "zh" : langParam === "en" ? "en" : cookieStore.get("lang")?.value === "zh" ? "zh" : "en";

  return (
    <div className="flex flex-1 flex-col gap-14">
      {/* ---- Hero ---- */}
      <section className="grid items-center gap-10 md:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-5">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
            The AI knowledge bank
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-fg sm:text-5xl">
            Master AI.
            <br />
            Manage the change.
          </h1>
          <p className="max-w-xl text-lg text-fg-secondary">
            brainbank turns everything you learn about AI — articles, videos,
            documents, experiments — into connected knowledge pages with
            learning maps, hands-on steps, and curated sources. Knowledge
            management for the age of AI, and a field guide for the change it
            brings.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="/classroom"
              className="rounded-md bg-accent px-5 py-2.5 font-semibold text-accent-fg hover:opacity-90 transition-opacity"
            >
              Explore the AI Classroom
            </Link>
            {session ? (
              <Link
                href="/classroom/new"
                className="rounded-md border border-border px-5 py-2.5 font-semibold text-fg hover:border-accent hover:text-accent transition-colors"
              >
                + Capture knowledge
              </Link>
            ) : (
              <Link
                href="/search"
                className="rounded-md border border-border px-5 py-2.5 font-semibold text-fg hover:border-accent hover:text-accent transition-colors"
              >
                Search the bank
              </Link>
            )}
          </div>

          {data && (
            <dl className="mt-2 grid grid-cols-2 gap-x-8 gap-y-3 border-t border-border pt-4 sm:grid-cols-4">
              <Stat label="Knowledge pages" value={data.stats.pages} />
              <Stat label="Classroom articles" value={data.stats.articles} />
              <Stat label="Connections" value={data.stats.connections} />
              <Stat label="Topics" value={data.stats.topics} />
            </dl>
          )}
        </div>

        <div className="hidden justify-center md:flex">
          <HeroVisual />
        </div>
      </section>

      {/* ---- DB state banners ---- */}
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

      {/* ---- Three pillars ---- */}
      <section className="grid gap-4 md:grid-cols-3">
        {PILLARS.map((p) => (
          <div
            key={p.kind}
            className="flex flex-col gap-3 rounded-xl border border-border bg-bg-elevated p-6"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
              <PillarIcon kind={p.kind} />
            </span>
            <h2 className="text-lg font-semibold text-fg">{p.title}</h2>
            <p className="text-sm leading-relaxed text-fg-secondary">{p.body}</p>
            <Link href={p.href} className="mt-auto text-sm font-medium text-accent hover:underline">
              {p.cta} →
            </Link>
          </div>
        ))}
      </section>

      {/* ---- Category index ---- */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold text-fg">Browse by category</h2>
          <Link href="/classroom" className="text-sm text-accent hover:underline">
            All classroom subtabs →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CLASSROOM_TABS.map(({ value, label }) => {
            const n = data?.categoryCounts.get(value) ?? 0;
            return (
              <Link
                key={value}
                href={`/classroom?tab=${value}`}
                className="group flex flex-col gap-2 rounded-lg border border-border bg-bg-elevated p-4 hover:border-accent transition-colors"
              >
                <span className="text-accent">
                  <CategoryGlyph category={value} />
                </span>
                <span className="font-medium text-fg group-hover:text-accent transition-colors">
                  {label}
                </span>
                <span className="text-xs text-fg-secondary">
                  {n} {n === 1 ? "article" : "articles"}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ---- Latest classroom articles + recent knowledge ---- */}
      <section className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold text-fg">Latest from the AI Classroom</h2>
            <Link href="/classroom" className="text-sm text-accent hover:underline">
              View all →
            </Link>
          </div>
          {data && data.latestArticles.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-bg-elevated">
              {data.latestArticles.map((a) => (
                <li key={a.slug} className="p-4">
                  <Link
                    href={`/classroom/${a.slug}`}
                    className="font-medium text-fg hover:text-accent transition-colors"
                  >
                    {a.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
                    {a.category && (
                      <span className="rounded-full border border-accent/50 px-2 py-0.5 text-accent">
                        {CLASSROOM_TABS.find((t) => t.value === a.category)?.label ?? a.category}
                      </span>
                    )}
                    <span>{new Date(a.createdAt).toLocaleString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyPanel>
              No classroom articles yet.{" "}
              {session && (
                <Link href="/classroom/new" className="text-accent hover:underline">
                  Publish the first one
                </Link>
              )}
            </EmptyPanel>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold text-fg">Recent knowledge pages</h2>
            {session && (
              <Link href="/new" className="text-sm text-accent hover:underline">
                + New knowledge →
              </Link>
            )}
          </div>
          {data && data.recentNotes.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-bg-elevated">
              {data.recentNotes.map((n) => (
                <li key={n.id} className="p-4">
                  <Link
                    href={`/notes/${n.slug}?lang=${lang}`}
                    className="font-medium text-fg hover:text-accent transition-colors"
                  >
                    {n.title}
                  </Link>
                  <div className="mt-1 text-xs text-fg-secondary">
                    {n.status} · {n.sourceType} · {new Date(n.updatedAt).toLocaleDateString()}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyPanel>
              No notes yet.{" "}
              {session && (
                <Link href="/new" className="text-accent hover:underline">
                  Create your first one
                </Link>
              )}
            </EmptyPanel>
          )}
        </div>
      </section>

      {/* ---- Topic index ---- */}
      {data && data.topTags.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-fg">Topic index</h2>
          <div className="flex flex-wrap gap-2">
            {data.topTags.map((t) => (
              <Link
                key={t.name}
                href={`/search?q=${encodeURIComponent(t.name)}`}
                className="rounded-full border border-border bg-bg-elevated px-3 py-1.5 text-sm text-fg-secondary hover:border-accent hover:text-accent transition-colors"
              >
                #{t.name}
                <span className="ml-1.5 text-xs opacity-70">{t.uses}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-fg-secondary">{label}</dt>
      <dd className="text-2xl font-semibold text-accent">{value}</dd>
    </div>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-sm text-fg-secondary">
      {children}
    </div>
  );
}
