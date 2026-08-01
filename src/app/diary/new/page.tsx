import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { DiaryComposer } from "@/components/diary-composer";

export const dynamic = "force-dynamic";
// saveDiaryEntry runs a local-model call to auto-name and tag the entry
// before it returns. Server Actions inherit their Vercel Function duration
// from the invoking page (see the long comment on classroom/[slug]/page.tsx
// for why this export has to live here rather than in actions.ts), and a
// cold local model can take a while. Lower than the classroom's 500 because
// this is a single short generation, not a chain of them.
export const maxDuration = 300;

export default async function NewDiaryEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; date?: string }>;
}) {
  const { lang: langParam, date } = await searchParams;
  const session = await auth();
  if (!session) redirect("/login?callbackUrl=/diary/new");

  const lang = await getLang(langParam);
  const s = t(lang).diary;

  // Clicking an empty heatmap cell pre-dates the entry to that day, keeping
  // the time-of-day component at "now" so backfilling feels natural.
  let occurredAt = new Date();
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const picked = new Date(`${date}T00:00:00`);
    if (!Number.isNaN(picked.getTime())) {
      const now = new Date();
      picked.setHours(now.getHours(), now.getMinutes());
      occurredAt = picked;
    }
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-fg">{s.newTitle}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{s.newDescription}</p>
      </div>
      <DiaryComposer lang={lang} defaultOccurredAt={occurredAt.toISOString()} />
    </div>
  );
}
