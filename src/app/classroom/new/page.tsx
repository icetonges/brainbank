import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { CLASSROOM_TABS } from "@/lib/classroom";
import { ClassroomComposer } from "@/components/classroom-composer";

export default async function NewClassroomArticlePage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg">New AI Classroom article</h1>
        <p className="mt-1 text-fg-secondary">
          One box for everything — write or paste content, links, YouTube
          videos, and images. Saving creates the knowledge page and AI
          publish assist adds a learning map, hands-on steps, and the top 3
          sources.
        </p>
      </div>

      <ClassroomComposer
        categories={CLASSROOM_TABS.map(({ value, label }) => ({ value, label }))}
      />
    </div>
  );
}
