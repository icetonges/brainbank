import { transcribeAudio } from "@/lib/ai/media";

export const runtime = "nodejs";
export const maxDuration = 300;

// Speech-to-text, intentionally public — backs the /llm page's 🎤 mic
// input (record a question instead of typing it), same public-by-design
// reasoning as /api/ai/assist's context: "knowledge" branch.
//
// Expects multipart/form-data with a "file" field (whatever the browser's
// MediaRecorder produced — audio/webm in Chrome/Firefox, audio/mp4 in
// Safari, agent-server/whisper-cli sniffs the container) and an optional
// "language" field. Response: { text: string }.
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const language = form.get("language");

  if (!(file instanceof Blob)) {
    return new Response("file (audio) is required", { status: 400 });
  }

  try {
    const result = await transcribeAudio({
      file,
      filename: file instanceof File ? file.name || "audio.webm" : "audio.webm",
      language: typeof language === "string" && language ? language : undefined,
    });
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    return new Response(message, { status: 502 });
  }
}
