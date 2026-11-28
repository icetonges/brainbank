import { auth } from "@/auth";
import { ClassroomIndexView } from "@/components/views/classroom-index";
import { isClassroomCategory } from "@/lib/classroom";
import type { ClassroomCategory } from "@/lib/db/schema";
import { getLang } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

/** Per-request classroom index: the owner, and anyone on a non-default tab.
 * Anonymous readers of the default view are rewritten to the cached copy
 * under /pub or /pubzh (see next.config.ts). */
export default async function ClassroomPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; lang?: string }>;
}) {
  const { tab, lang: langParam } = await searchParams;
  // "all" is the default landing state — a synthetic tab (not part of the
  // ClassroomCategory enum) that shows articles across every subtab.
  const activeTab: ClassroomCategory | "all" =
    tab && isClassroomCategory(tab) ? tab : "all";

  const session = await auth();
  const lang = await getLang(langParam);
  return <ClassroomIndexView activeTab={activeTab} lang={lang} isOwner={Boolean(session)} />;
}
