import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { isNotNull } from "drizzle-orm";
import { CLASSROOM_TABS } from "@/lib/classroom";
import { getLang } from "@/lib/i18n-server";
import { t, CLASSROOM_TAB_LABELS_ZH } from "@/lib/i18n";
import { ClassroomComposer } from "@/components/classroom-composer";

export default async function NewClassroomArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { lang: langParam } = await searchParams;
  const lang = await getLang(langParam);
  const s = t(lang).classroom;

  // Feeds the subcategory field's <datalist> — every distinct value
  // already in use, so picking one is a click instead of retyping it.
  let existingSubcategories: string[] = [];
  try {
    const rows = await db
      .selectDistinct({ subcategory: notes.subcategory })
      .from(notes)
      .where(isNotNull(notes.subcategory));
    existingSubcategories = rows
      .map((r) => r.subcategory)
      .filter((v): v is string => Boolean(v))
      .sort((a, b) => a.localeCompare(b));
  } catch (err) {
    console.error("Failed to load existing subcategories:", err);
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg">{s.newTitle}</h1>
        <p className="mt-1 text-fg-secondary">{s.newDescription}</p>
      </div>

      <ClassroomComposer
        lang={lang}
        categories={CLASSROOM_TABS.map(({ value, label }) => ({
          value,
          label: lang === "zh" ? CLASSROOM_TAB_LABELS_ZH[value] : label,
        }))}
        existingSubcategories={existingSubcategories}
      />
    </div>
  );
}
