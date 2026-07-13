import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { classroomSubcategories, classroomSections } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
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

  // Feeds the subcategory picker — sorted ascending by name (default A→Z)
  // so "General Knowledge" sits above "Newsletters" regardless of
  // insertion order.
  let subcategories: { id: number; name: string }[] = [];
  let sections: { id: number; name: string; subcategoryId: number }[] = [];
  try {
    subcategories = await db
      .select({ id: classroomSubcategories.id, name: classroomSubcategories.name })
      .from(classroomSubcategories)
      .orderBy(asc(classroomSubcategories.name));
    sections = await db
      .select({
        id: classroomSections.id,
        name: classroomSections.name,
        subcategoryId: classroomSections.subcategoryId,
      })
      .from(classroomSections)
      .orderBy(asc(classroomSections.name));
  } catch (err) {
    console.error("Failed to load subcategories/sections:", err);
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
        subcategories={subcategories}
        sections={sections}
      />
    </div>
  );
}
