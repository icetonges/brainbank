import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { LlmStatusCard } from "@/components/llm-status-card";
import { LlmChatPanel } from "@/components/llm-chat-panel";

export default async function LlmPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { lang: langParam } = await searchParams;
  const lang = await getLang(langParam);
  const s = t(lang).llm;

  return (
    <div className="flex w-full max-w-3xl flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg">{s.title}</h1>
        <p className="mt-1 text-fg-secondary">{s.description}</p>
      </div>

      <LlmStatusCard s={s} />
      <LlmChatPanel s={s} />
    </div>
  );
}
