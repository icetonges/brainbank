import { auth } from "@/auth";
import { streamAssist } from "@/lib/ai/tasks";
import { MODELS, type ModelId } from "@/lib/ai/models";
import type { ModelMessage } from "ai";

export const runtime = "nodejs";
// Backstop, not the primary fix — streamAssist (see tasks.ts) now bounds
// every attempt against agent-server with its own abortSignal timeouts:
// 20s to first token, then up to 180s more to finish a stream that did
// start (worst case ~200s per model), or 90s for the non-streaming
// fallback if streaming never started (worst case ~110s per model). With
// today's single-model chain that's already comfortably under this, but
// this cap is what actually guarantees a hang can never again ride all the
// way to Vercel's unconfigured default and die with "Task timed out after
// 300 seconds" and no response at all reaching the client, the way it did
// before this fix — including if the chain grows to more than one model
// later.
//
// Raised from 290 -> 500 to give translateClassroomArticleAction's
// validation-retry cascade (tasks.ts's detectTranslationProblem /
// TranslationQualityError) more headroom against a document with several
// chunks that each need a second warm-model attempt. NOTE: 290 was
// originally chosen as "just under" Vercel's classic 300s serverless
// ceiling (the exact "Task timed out after 300 seconds" message above is
// what an unconfigured function hit). 500 exceeds that classic ceiling —
// it only actually takes effect if this Vercel project has Fluid Compute
// enabled (Pro allows up to 800s, Enterprise up to 900s, with Fluid on).
// Without Fluid Compute, Vercel is expected to reject this value at
// deploy/build time or silently clamp it back down — verify Fluid Compute
// is on for this project (Project Settings -> Functions) before relying
// on 500 actually being honored.
// Reverted 500 -> 300 on 2026-09-01: pushes stopped producing any Vercel
// deployment at all (not a failed build with logs — no deployment showed up),
// consistent with the warning above: 500 only works with Fluid Compute
// enabled on this project, which isn't confirmed on. 300 is the hard ceiling
// on Hobby and the safe default on Pro without Fluid Compute. If Fluid
// Compute is verified on (Project Settings -> Functions) this can go back up.
export const maxDuration = 300;

interface AssistRequestBody {
  messages: { role: "user" | "assistant"; content: string }[];
  modelId?: ModelId;
  // "note" (default) is the note-drafting assist panel embedded on /new;
  // "knowledge" is the general-purpose chatbox on /llm — see
  // KNOWLEDGE_CHAT_SYSTEM_PROMPT in tasks.ts for what actually differs.
  context?: "note" | "knowledge";
}

export async function POST(req: Request) {
  const body: AssistRequestBody = await req.json();

  // context: "knowledge" is the public /llm chatbox — intentionally usable
  // without signing in, per the owner. context: "note" (default) is the
  // AiAssistPanel embedded in the note-drafting flow on /new, which stays
  // behind auth like the rest of that page — checked here rather than in
  // middleware.ts because this one route serves both, and only one of the
  // two contexts should be gated.
  if ((body.context ?? "note") !== "knowledge") {
    const session = await auth();
    if (!session) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  if (body.modelId && !MODELS.some((m) => m.id === body.modelId)) {
    return new Response("Unknown model id", { status: 400 });
  }

  const messages: ModelMessage[] = body.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    return await streamAssist(messages, body.modelId, body.context ?? "note");
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return new Response(message, { status: 500 });
  }
}
