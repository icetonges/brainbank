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
export const maxDuration = 290;

interface AssistRequestBody {
  messages: { role: "user" | "assistant"; content: string }[];
  modelId?: ModelId;
  // "note" (default) is the note-drafting assist panel embedded on /new;
  // "knowledge" is the general-purpose chatbox on /llm — see
  // KNOWLEDGE_CHAT_SYSTEM_PROMPT in tasks.ts for what actually differs.
  context?: "note" | "knowledge";
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body: AssistRequestBody = await req.json();

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
