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
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { CLASSROOM_TAB_LABELS } from "@/lib/classroom";
import { getLang } from "@/lib/i18n-server";
import { t, CLASSROOM_TAB_LABELS_ZH } from "@/lib/i18n";
import { Markdown } from "@/components/markdown";
import { DeleteArticleButton } from "@/components/delete-article-button";
import { PendingFormButton } from "@/components/pending-form-button";
import { regenerateGuideAction, translateClassroomArticleAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ClassroomArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang: langParam } = await searchParams;
  const session = await auth();
  const lang = await getLang(langParam);
  const s = t(lang).classroom;
  const dateLocale = lang === "zh" ? "zh-CN" : undefined;

  let note: typeof notes.$inferSelect | undefined;
  let contents: (typeof noteContent.$inferSelect)[] = [];
  let guide: typeof learningGuides.$inferSelect | undefined;
  let tagRows: { name: string }[] = [];

  try {
    note = await db.query.notes.findFirst({ where: eq(notes.slug, slug) });
    if (note) {
      contents = await db.query.noteContent.findMany({
        where: eq(noteContent.noteId, note.id),
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
        <p className="font-medium text-fg">{s.loadFailed}</p>
        <p className="mt-1 text-sm">{s.reload}</p>
      </div>
    );
  }

  if (!note || !note.category) notFound();
  if (note.status !== "published" && !session) notFound();

  // Content in the requested language, falling back to whatever exists
  // (with a "not translated yet" hint + translate button for the owner).
  const wanted = contents.find((c) => c.language === lang && c.bodyMarkdown);
  const fallback = contents.find((c) => c.bodyMarkdown);
  const content = wanted ?? fallback;
  const isFallback = !wanted && Boolean(fallback);
  // notes.title is always the original language's title — a translated
  // title (set by the translate button) lives on the language-matched
  // note_content row instead, falling back to the original if untranslated.
  const displayTitle = (lang === note.primaryLanguage ? note.title : content?.title) || note.title;

  // Guide text in the requested language (zh columns fall back to base).
  const learningMap =
    lang === "zh" ? guide?.learningMapZh || guide?.learningMap : guide?.learningMap;
  const handsOn = lang === "zh" ? guide?.handsOnZh || guide?.handsOn : guide?.handsOn;

  const regenerate = regenerateGuideAction.bind(null, note.id, slug);
  // Always targets the article's *other* language, independent of which
  // language you're currently viewing the page in (lang) — a Chinese
  // article always offers "Translate to English" and vice versa. Tying
  // this to the view toggle instead (the old behavior) meant the button
  // only appeared once you happened to switch the site to the language
  // that was missing, so a freshly published article — viewed in its own
  // language, as it is by default — never showed a translate button.
  const otherLang: "en" | "zh" = note.primaryLanguage === "zh" ? "en" : "zh";
  const translate = translateClassroomArticleAction.bind(null, note.id, slug, otherLang);
  const tabLabel =
    lang === "zh" ? CLASSROOM_TAB_LABELS_ZH[note.category] : CLASSROOM_TAB_LABELS[note.category];

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/classroom?lang=${lang}`} className="text-fg-secondary hover:text-accent">
            {s.title}
          </Link>
          <span className="text-fg-secondary">/</span>
          <Link
            href={`/classroom?tab=${note.category}&lang=${lang}`}
            className="rounded-full border border-accent/50 px-2.5 py-0.5 text-xs font-medium text-accent hover:bg-accent hover:text-accent-fg transition-colors"
          >
            {tabLabel}
          </Link>
          {note.subcategory && (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-fg-secondary">
              {note.subcategory}
            </span>
          )}
        </div>

        <h1 className="text-3xl font-semibold text-fg">{displayTitle}</h1>
        <p className="text-sm text-fg-secondary">
          {new Date(note.createdAt).toLocaleString(dateLocale)}
          {note.updatedAt.getTime() !== note.createdAt.getTime()
            ? ` · ${s.updated} ${new Date(note.updatedAt).toLocaleString(dateLocale)}`
            : ""}
        </p>

        {tagRows.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tagRows.map((tag) => (
              <span
                key={tag.name}
                className="rounded-full border border-border px-2.5 py-0.5 text-xs text-fg-secondary"
              >
                #{tag.name}
              </span>
            ))}
          </div>
        )}
      </header>

      {session && (
        <div className="flex flex-wrap items-center gap-2 border-y border-border py-3">
          <Link
            href={`/classroom/${slug}/edit?lang=${lang}`}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors"
          >
            {s.edit}
          </Link>
          <form action={regenerate}>
            <PendingFormButton
              label={guide ? s.regenerateGuide : s.generateGuide}
              pendingLabel={s.generatingGuide}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors disabled:opacity-60"
            />
          </form>
          <form action={translate}>
            <PendingFormButton
              label={otherLang === "zh" ? s.translateToZh : s.translateToEn}
              pendingLabel={s.translating}
              className="rounded-md border border-accent/60 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent hover:text-accent-fg transition-colors disabled:opacity-60"
            />
          </form>
          <div className="ml-auto">
            <DeleteArticleButton noteId={note.id} title={note.title} />
          </div>
        </div>
      )}

      {isFallback && (
        <p className="rounded-lg border border-border bg-bg-elevated p-3 text-sm text-fg-secondary">
          {lang === "zh" ? s.notTranslatedYetToZh : s.notTranslatedYetToEn}
        </p>
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
          {learningMap && (
            <GuideSection title={s.learningMap}>
              <Markdown>{learningMap}</Markdown>
            </GuideSection>
          )}

          {handsOn && (
            <GuideSection title={s.handsOn}>
              <Markdown>{handsOn}</Markdown>
            </GuideSection>
          )}

          <GuideSection title={s.topSources}>
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
            <p className="mt-3 text-xs text-fg-secondary">{s.linksCaveat}</p>
          </GuideSection>
        </>
      ) : (
        session && (
          <div className="rounded-lg border border-dashed border-border p-5 text-fg-secondary">
            {s.noGuideYet}
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
