import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { LlmStatusCard } from "@/components/llm-status-card";
import { LlmChatPanel } from "@/components/llm-chat-panel";

// Intentionally public, unlike most of the rest of the app (/new, /admin) —
// this is a status page + chatbox for the self-hosted local model, and the
// owner explicitly wants anonymous visitors to be able to see it's online
// and try it. See the matching auth-removal comments on
// src/app/api/ai/health/route.ts and the context === "knowledge" branch of
// src/app/api/ai/assist/route.ts, which this page's components call.
export default async function LlmPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
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
