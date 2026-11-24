import { auth } from "@/auth";
import { getLang } from "@/lib/i18n-server";
import { HomeView } from "@/components/views/home";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const session = await auth();
  const { lang: langParam } = await searchParams;
  const lang = await getLang(langParam);
  return <HomeView lang={lang} isOwner={Boolean(session)} />;
}
