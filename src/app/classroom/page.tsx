import Link from "next/link";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import type { ClassroomCategory } from "@/lib/db/schema";
import { auth } from "@/auth";
import { CLASSROOM_TABS, isClassroomCategory } from "@/lib/classroom";
import { getLang } from "@/lib/i18n-server";
import { t, CLASSROOM_TAB_LABELS_ZH } from "@/lib/i18n";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ClassroomPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; lang?: string }>;
}) {
  const { tab, lang: langParam } = await searchParams;
  const activeTab: ClassroomCategory =
    tab && isClassroomCategory(tab) ? tab : CLASSROOM_TABS[0].value;

  const session = await auth();
  const lang = await getLang(langParam);
  const s = t(lang).classroom;
  const dateLocale = lang === "zh" ? "zh-CN" : undefined;

  let articles: {
    slug: string;
    title: string;
    createdAt: Date;
    status: string;
  }[] = [];
  let loadError = false;

  try {
    const rows = await db
      .select({
        slug: notes.slug,
        title: notes.title,
        createdAt: notes.createdAt,
        status: notes.status,
      })
      .from(notes)
      .where(eq(notes.category, activeTab))
      .orderBy(desc(notes.createdAt));

    // Public-read/private-edit, same as regular notes: anonymous visitors
    // only see published articles; the owner sees drafts/private too.
    articles = session ? rows : rows.filter((r) => r.status === "published");
  } catch (err) {
    console.error("Failed to load classroom articles:", err);
    loadError = true;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-fg">{s.title}</h1>
          <p className="mt-1 text-fg-secondary">{s.description}</p>
        </div>
        {session && (
          <Link
            href="/classroom/new"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 transition-opacity"
          >
            {s.newArticle}
          </Link>
        )}
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-border pb-px">
        {CLASSROOM_TABS.map(({ value, label }) => {
          const active = value === activeTab;
          return (
            <Link
              key={value}
              href={`/classroom?tab=${value}&lang=${lang}`}
              className={`rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-accent text-accent"
                  : "border-transparent text-fg-secondary hover:text-accent"
              }`}
            >
              {lang === "zh" ? CLASSROOM_TAB_LABELS_ZH[value] : label}
            </Link>
          );
        })}
      </nav>

      {loadError ? (
        <div className="rounded-lg border border-danger/40 bg-bg-elevated p-5 text-fg-secondary">
          <p className="font-medium text-fg">{s.loadFailed}</p>
          <p className="mt-1 text-sm">{s.reload}</p>
        </div>
      ) : articles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-fg-secondary">
          <p>{s.emptyTab}</p>
          {session && (
            <p className="mt-1 text-sm">
              <Link href="/classroom/new" className="text-accent hover:underline">
                {s.createFirstArticle}
              </Link>{" "}
              {s.autoFiled}
            </p>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {articles.map((a) => (
            <li key={a.slug}>
              <Link
                href={`/classroom/${a.slug}?lang=${lang}`}
                className="flex flex-col gap-1 rounded-lg border border-border bg-bg-elevated p-4 hover:border-accent transition-colors"
              >
                <span className="font-semibold text-fg">{a.title}</span>
                <span className="text-xs text-fg-secondary">
                  {new Date(a.createdAt).toLocaleString(dateLocale)}
                  {a.status !== "published" ? ` · ${a.status}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
