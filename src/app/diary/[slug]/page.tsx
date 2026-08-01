import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  notes,
  noteContent,
  diaryEntries,
  noteTags,
  tags as tagsTable,
  knowledgeAtoms,
  knowledgeAtomSources,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { Markdown } from "@/components/markdown";
import { PendingFormButton } from "@/components/pending-form-button";
import { DeleteDiaryButton } from "@/components/delete-diary-button";
import { formatDateTime } from "@/lib/date";
import { redistillEntryAction } from "../actions";
import { lifeArea, tagColor, ATOM_KIND_COLORS } from "@/lib/knowledge/taxonomy";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MOOD_EMOJI: Record<string, string> = {
  great: "🤩",
  good: "🙂",
  neutral: "😐",
  low: "😕",
  rough: "😣",
};

export default async function DiaryEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang: langParam } = await searchParams;
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/diary/${slug}`);

  const lang = await getLang(langParam);
  const s = t(lang).diary;
  const dateLocale = lang === "zh" ? "zh-CN" : undefined;

  const note = await db.query.notes.findFirst({ where: eq(notes.slug, slug) });
  if (!note || note.sourceType !== "diary") notFound();

  const entry = await db.query.diaryEntries.findFirst({
    where: eq(diaryEntries.noteId, note.id),
  });
  if (!entry) notFound();

  const content = await db.query.noteContent.findFirst({
    where: and(eq(noteContent.noteId, note.id), eq(noteContent.language, note.primaryLanguage)),
  });

  const tagRows = await db
    .select({ name: tagsTable.name })
    .from(noteTags)
    .innerJoin(tagsTable, eq(noteTags.tagId, tagsTable.id))
    .where(eq(noteTags.noteId, note.id));

  // What this entry actually taught the knowledge base — the feedback loop
  // that makes writing feel worthwhile rather than like shouting into a
  // void. Shown inline on the entry itself.
  const learned = await db
    .select({
      id: knowledgeAtoms.id,
      kind: knowledgeAtoms.kind,
      statement: knowledgeAtoms.statement,
      reinforcementCount: knowledgeAtoms.reinforcementCount,
      isReinforcement: knowledgeAtomSources.isReinforcement,
    })
    .from(knowledgeAtomSources)
    .innerJoin(knowledgeAtoms, eq(knowledgeAtoms.id, knowledgeAtomSources.atomId))
    .where(eq(knowledgeAtomSources.noteId, note.id))
    .orderBy(desc(knowledgeAtomSources.createdAt));

  const redistill = redistillEntryAction.bind(null, note.id, slug);

  return (
    <article className="flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href={`/diary?lang=${lang}`} className="text-fg-secondary hover:text-accent">
          {s.title}
        </Link>
        <span className="text-fg-secondary">/</span>
        <span className="rounded-full bg-warn/15 px-2.5 py-0.5 text-xs font-semibold text-warn">
          🔒 {s.privateAlways}
        </span>
      </div>

      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold text-fg">{note.title}</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-secondary">
          <span>{formatDateTime(entry.occurredAt, dateLocale)}</span>
          {entry.mood && (
            <span>
              {MOOD_EMOJI[entry.mood]} {entry.mood}
            </span>
          )}
          {entry.energy && (
            <span className="flex items-center gap-1">
              {s.energy}
              <span className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className={`h-3 w-1.5 rounded-sm ${n <= entry.energy! ? "bg-accent" : "bg-border"}`}
                  />
                ))}
              </span>
            </span>
          )}
          {entry.titleSource === "auto" && <span className="text-xs opacity-70">· {s.autoNamed}</span>}
        </p>

        {tagRows.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tagRows.map((tag) => {
              const area = lifeArea(tag.name);
              return (
                <Link
                  key={tag.name}
                  href={`/diary?tag=${encodeURIComponent(tag.name)}&lang=${lang}`}
                  style={{ borderColor: `${tagColor(tag.name)}88`, color: tagColor(tag.name) }}
                  className="rounded-full border px-2.5 py-0.5 text-xs font-medium hover:opacity-80"
                >
                  {area ? `${area.emoji} ${lang === "zh" ? area.labelZh : area.labelEn}` : `#${tag.name}`}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2 border-y border-border py-3">
        <Link
          href={`/diary/${slug}/edit?lang=${lang}`}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors"
        >
          {s.edit}
        </Link>
        <form action={redistill}>
          <PendingFormButton
            label={entry.distilledAt ? s.redistill : s.distillNow}
            pendingLabel={s.distilling}
            className="rounded-md border border-accent/60 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent hover:text-accent-fg transition-colors disabled:opacity-60"
          />
        </form>
        <span className="text-xs text-fg-secondary">
          {entry.distilledAt
            ? `${s.distilledAt} ${formatDateTime(entry.distilledAt, dateLocale)}`
            : s.pendingDistill}
        </span>
        <div className="ml-auto">
          <DeleteDiaryButton noteId={note.id} title={note.title} lang={lang} />
        </div>
      </div>

      {content?.bodyMarkdown ? (
        <section className="rounded-xl border border-border bg-bg-elevated p-6">
          <Markdown>{content.bodyMarkdown}</Markdown>
        </section>
      ) : (
        <p className="text-fg-secondary">{s.noBody}</p>
      )}

      {entry.scratch.trim() && (
        <section className="rounded-xl border border-dashed border-border bg-bg p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-secondary">
            ✂️ {s.scratchTitle}
          </h2>
          <pre className="whitespace-pre-wrap font-mono text-sm text-fg-secondary">
            {entry.scratch}
          </pre>
        </section>
      )}

      {/* The payoff loop: writing this entry visibly made the assistant
          smarter, and you can see exactly how. */}
      {learned.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border border-l-4 border-l-accent bg-bg-elevated">
          <h2 className="flex items-center gap-2 border-b border-border bg-accent/10 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-accent">
            🧠 {s.whatItLearned}
            <span className="ml-auto text-xs font-normal">{learned.length}</span>
          </h2>
          <ul className="flex flex-col divide-y divide-border">
            {learned.map((atom) => (
              <li key={`${atom.id}-${atom.isReinforcement}`} className="flex items-start gap-3 px-5 py-3">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: ATOM_KIND_COLORS[atom.kind] ?? "#64748b" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">{atom.statement}</p>
                  <p className="mt-0.5 text-xs text-fg-secondary">
                    {atom.kind}
                    {atom.isReinforcement
                      ? ` · ${s.reinforced} (${atom.reinforcementCount}×)`
                      : ` · ${s.newlyLearned}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-5 py-2.5">
            <Link href="/assistant" className="text-xs text-accent hover:underline">
              {s.seeKnowledge} →
            </Link>
          </div>
        </section>
      )}
    </article>
  );
}
