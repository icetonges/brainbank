import { auth } from "@/auth";
import { generateImage } from "@/lib/ai/media";

export const runtime = "nodejs";
export const maxDuration = 300;

// Image generation via agent-server's flux.2-klein — registered in
// models.ts and media.ts for completeness (the same agent-server upgrade
// that added TTS/STT), but has no caller yet: nothing in the app currently
// asks for an AI-generated image. Owner-gated (unlike speech/transcribe)
// because generation has a real compute cost and, unlike a chat reply or
// a TTS clip, there's no existing public feature this backs — add one
// (e.g. an article cover-image button) when there's an actual use for it.
interface ImageRequestBody {
  prompt?: string;
  n?: number;
  size?: string;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  let body: ImageRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return new Response("prompt is required", { status: 400 });

  try {
    const result = await generateImage({ prompt, n: body.n, size: body.size });
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed";
    return new Response(message, { status: 502 });
  }
}
