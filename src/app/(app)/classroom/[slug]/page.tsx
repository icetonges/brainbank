import type { Metadata } from "next";
import { auth } from "@/auth";
import { getLang } from "@/lib/i18n-server";
import { ClassroomArticleView } from "@/components/views/classroom-article";

export const dynamic = "force-dynamic";
// Server Actions run as a Vercel Function for the page that invoked them —
// NOT for the "use server" file the action is defined in — so this is
// where regenerateGuideAction and translateClassroomArticleAction
// (classroom/actions.ts) actually get their execution-time ceiling.
// classroom/actions.ts explicitly could NOT export this itself (a "use
// server" file may only export async functions; Turbopack fails the whole
// module, and every importer, if a plain const like this sits alongside
// them — see the comment at the top of that file), so without this export
// those two AI-backed actions were silently running on the Vercel
// project's unconfigured account-level default duration instead — often
// well under the 120s a single local-model call (TASK_TIMEOUT_MS,
// tasks.ts) can take, let alone the sequential body+summary+title(+guide)
// calls translateClassroomArticleAction makes. When the account default
// was hit mid-call, Vercel killed the function and returned its own
// platform response instead of RSC, which the client surfaces as "An
// unexpected response was received from the server" — repeatable on every
// Translate/Regenerate click against a slow local agent-server, not an
// intermittent fluke. Matches /api/ai/assist/route.ts's maxDuration
// (same reasoning, same ceiling — see that file's comment).
//
// Raised from 290 -> 500 for headroom against the validation-retry
// cascade in translateClassroomArticleAction (tasks.ts's
// detectTranslationProblem/TranslationQualityError can cost a second
// warm-model attempt per chunk on a long article). This exceeds the
// classic Vercel serverless 300s ceiling that 290 was originally chosen
// to stay just under — it only takes effect with Fluid Compute enabled on
// this Vercel project (Project Settings -> Functions); otherwise Vercel
// is expected to reject or clamp this value at deploy time.
// Reverted 500 -> 300 on 2026-09-01: pushes stopped producing any Vercel
// deployment at all (not a failed build with logs — no deployment showed up),
// consistent with the warning above: 500 only works with Fluid Compute
// enabled on this project, which isn't confirmed on. 300 is the hard ceiling
// on Hobby and the safe default on Pro without Fluid Compute. If Fluid
// Compute is verified on (Project Settings -> Functions) this can go back up.
export const maxDuration = 300;

/**
 * Canonical URL for this article, with no `?lang=` param. Every internal link
 * in the app carries one, so the same article is reachable at
 * /classroom/x, /classroom/x?lang=en and /classroom/x?lang=zh — three URLs,
 * three crawls, three function invocations for identical content. This is
 * derived from `params` alone, so it adds no query.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { alternates: { canonical: `/classroom/${slug}` } };
}

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
  return <ClassroomArticleView slug={slug} lang={lang} isOwner={Boolean(session)} />;
}
