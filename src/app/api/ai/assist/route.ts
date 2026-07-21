import { auth } from "@/auth";
import { streamAssist } from "@/lib/ai/tasks";
import { MODELS, type ModelId } from "@/lib/ai/models";
import type { ModelMessage } from "ai";

export const runtime = "nodejs";

interface AssistRequestBody {
  messages: { role: "user" | "assistant"; content: string }[];
  modelId?: ModelId;
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
    return await streamAssist(messages, body.modelId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return new Response(message, { status: 500 });
  }
}
