import { synthesizeSpeech } from "@/lib/ai/media";

export const runtime = "nodejs";
// Single TTS call, not the chunked audiobook pipeline (classroom/
// audio-actions.ts) — bounded well under that flow's per-chunk time, but
// still a real network+inference round trip to agent-server, so this gets
// its own generous ceiling rather than an unconfigured default. See
// vercel.json's src/app/api/tasks/** entry for the platform-level backstop.
export const maxDuration = 300;

// Ephemeral text-to-speech, intentionally public — backs the /llm page's
// per-reply "🔊 Play" button, its mic-input round trip having nothing to
// do with this route, and the standalone "paste text, get audio" tool.
// Nothing here is persisted; that's the classroom audiobook flow's job
// (audio-actions.ts), which stores segments because an article is
// revisited by many people and shouldn't be re-synthesized per view — a
// chat reply or ad-hoc text snippet isn't, so there's nothing worth
// caching.
const MAX_CHARS = 4000;

interface SpeechRequestBody {
  text?: string;
  voice?: string;
  speed?: number;
  format?: "mp3" | "wav" | "opus" | "flac";
}

export async function POST(req: Request) {
  let body: SpeechRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) return new Response("text is required", { status: 400 });
  if (text.length > MAX_CHARS) {
    return new Response(`text is limited to ${MAX_CHARS} characters per request`, { status: 400 });
  }

  try {
    const { audio, contentType } = await synthesizeSpeech({
      text,
      voice: body.voice,
      speed: body.speed,
      format: body.format,
    });
    return new Response(audio, { headers: { "Content-Type": contentType } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Text-to-speech failed";
    return new Response(message, { status: 502 });
  }
}
