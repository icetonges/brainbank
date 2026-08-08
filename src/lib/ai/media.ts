import { createHash } from "crypto";
import { TTS_WIRE_ID, STT_WIRE_ID, IMAGE_WIRE_ID } from "./models";

/**
 * Non-chat agent-server capabilities: text-to-speech, speech-to-text,
 * image generation. Same base URL/auth as the chat models in providers.ts
 * (LOCAL_LLM_FUNNEL_URL / LOCAL_LLM_SHARED_SECRET) — one agent-server
 * process fronts /v1/chat/completions AND /v1/audio/*, /v1/images/*, so
 * this deliberately does NOT introduce a second pair of env vars the way
 * the original integration guide's reference routes did
 * (AGENT_SERVER_URL / AGENT_SERVER_API_KEY) — that would just be two
 * names for the same connection, with an easy way for them to drift out
 * of sync. See models.ts's "MEDIA MODELS" section for the wire ids.
 */

function agentServerConfig(): { baseURL: string; apiKey: string } {
  const baseURL = process.env.LOCAL_LLM_FUNNEL_URL;
  const apiKey = process.env.LOCAL_LLM_SHARED_SECRET;
  if (!baseURL || !apiKey) {
    throw new Error(
      "LOCAL_LLM_FUNNEL_URL / LOCAL_LLM_SHARED_SECRET are not set — see providers.ts's local(). Audio/image generation shares the same agent-server connection chat already uses.",
    );
  }
  return { baseURL: baseURL.replace(/\/+$/, ""), apiKey };
}

async function agentServerFetch(path: string, init: RequestInit): Promise<Response> {
  const { baseURL, apiKey } = agentServerConfig();
  return fetch(`${baseURL}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${apiKey}` },
  });
}

export interface SpeechResult {
  audio: ArrayBuffer;
  contentType: string;
}

/** Thrown specifically for a 429 from agent-server's own per-key rate
 *  limiter (observed directly in production: "rate limit exceeded: 60
 *  requests/minute for this key") — kept distinct from the generic
 *  Error below so a caller doing many sequential calls (lib/ai/audiobook.ts)
 *  can back off and retry instead of treating it like any other failure.
 *  `retryAfterMs` is populated from the response's Retry-After header when
 *  agent-server sends one; null means it didn't, and the caller has to
 *  fall back to its own guessed backoff. */
export class TtsRateLimitError extends Error {
  readonly retryAfterMs: number | null;
  constructor(message: string, retryAfterMs: number | null) {
    super(message);
    this.name = "TtsRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** Retry-After can be either delay-seconds ("120") or an HTTP-date — both
 *  are valid per RFC 9110 §10.2.3, and nothing about agent-server's own
 *  implementation is documented in this repo (it's a separate project —
 *  see agent-server-patch/README.md), so this handles both rather than
 *  assuming the simpler numeric form. Returns null if the header is
 *  absent or unparseable, not 0 — the caller needs to tell "server told
 *  us how long to wait" apart from "server didn't say." */
function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

// Maps this app's "en"/"zh" to the value mlx-audio's own qwen3-tts
// generate_custom_voice() documents for its `language` argument (see
// https://github.com/Blaizzy/mlx-audio/blob/main/mlx_audio/tts/models/qwen3_tts/README.md
// — the example passes language="English" alongside a named `speaker`,
// on the same predefined-voice code path our named TTS_VOICES_EN/ZH
// entries indicate agent-server uses, not the voice-cloning Base model).
// NOT CONFIRMED against agent-server's own schema — agent-server wraps
// mlx-audio behind an OpenAI-compatible /v1/audio/speech route, and
// OpenAI's own speech endpoint has no `language` field, so whether
// agent-server forwards a same-named extra field through to mlx-audio's
// `language=` argument is a question only agent-server's source (or its
// live /openapi.json) can answer — check that before assuming this is
// wired all the way through. Sent as a plain extra JSON field either way:
// harmless if agent-server ignores unknown fields (typical FastAPI
// behavior unless a route explicitly forbids extras), and directly fixes
// the code-switch-boundary truncation (e.g. "BashTool 启动的后台 shell"
// cutting off right before the untagged English word) if it's read.
const TTS_LANGUAGE_NAME: Record<"en" | "zh", string> = { en: "English", zh: "Chinese" };

/** Text-to-speech via agent-server's /v1/audio/speech (qwen3-tts). One
 *  call is one chunk — long text should be pre-split with chunkForSpeech
 *  below; agent-server/mlx-audio has a practical input-length ceiling and
 *  a single giant call is also just a worse UX (no progress, one huge
 *  file to fail on network hiccup). */
export async function synthesizeSpeech(input: {
  text: string;
  voice?: string;
  speed?: number;
  format?: "mp3" | "wav" | "opus" | "flac";
  language?: "en" | "zh";
}): Promise<SpeechResult> {
  const format = input.format ?? "mp3";
  const res = await agentServerFetch("/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: input.text,
      model: TTS_WIRE_ID,
      voice: input.voice,
      speed: input.speed,
      response_format: format,
      ...(input.language ? { language: TTS_LANGUAGE_NAME[input.language] } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) {
      throw new TtsRateLimitError(
        `Text-to-speech rate limited (429): ${body.slice(0, 300)}`,
        parseRetryAfterMs(res.headers.get("retry-after")),
      );
    }
    throw new Error(`Text-to-speech failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const audio = await res.arrayBuffer();
  return { audio, contentType: res.headers.get("content-type") || `audio/${format}` };
}

/** Speech-to-text via agent-server's /v1/audio/transcriptions (Whisper
 *  large-v3-turbo). `file` is whatever the browser's MediaRecorder (or a
 *  file input) produced — agent-server/whisper-cli sniffs the container. */
export async function transcribeAudio(input: {
  file: Blob;
  filename: string;
  language?: string;
}): Promise<{ text: string }> {
  const form = new FormData();
  form.set("file", input.file, input.filename);
  form.set("model", STT_WIRE_ID);
  if (input.language) form.set("language", input.language);
  form.set("response_format", "json");

  const res = await agentServerFetch("/v1/audio/transcriptions", { method: "POST", body: form });
  const body = await res.text();
  if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${body.slice(0, 300)}`);
  try {
    return JSON.parse(body) as { text: string };
  } catch {
    throw new Error(`Transcription returned an unexpected response: ${body.slice(0, 200)}`);
  }
}

/** Image generation via agent-server's /v1/images/generations
 *  (flux.2-klein). Registered for completeness (models.ts) — no caller
 *  yet; wire up when a feature (e.g. an article cover image) needs it. */
export async function generateImage(input: {
  prompt: string;
  n?: number;
  size?: string;
}): Promise<{ images: string[] }> {
  const res = await agentServerFetch("/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      model: IMAGE_WIRE_ID,
      n: input.n ?? 1,
      size: input.size,
      response_format: "b64_json",
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Image generation failed (${res.status}): ${body.slice(0, 300)}`);
  const parsed = JSON.parse(body) as { data: { b64_json: string }[] };
  return { images: parsed.data.map((d) => d.b64_json) };
}

// --- TEXT PREP FOR TTS ---

/** Strips markdown syntax down to plain, readable prose for TTS — code
 *  blocks are dropped entirely (reading "backtick backtick backtick
 *  function foo" aloud helps no one), images are dropped, links keep
 *  their visible text, and heading/emphasis/quote markers are stripped
 *  so the model doesn't literally say "pound pound heading" or "asterisk
 *  asterisk". Not a full markdown parser — a pragmatic regex pass, same
 *  spirit as this file's other "good enough for the task" helpers. */
export function markdownToSpeechText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, "") // fenced code blocks
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links -> visible text
    .replace(/^#{1,6}\s+/gm, "") // heading markers
    .replace(/^>\s?/gm, "") // blockquote markers
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "") // checklist markers
    .replace(/^\s*[-*+]\s+/gm, "") // bullet markers
    .replace(/^\s*\d+[.)]\s+/gm, "") // ordered-list markers
    .replace(/^\s*-{3,}\s*$/gm, "") // horizontal rules
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, "$1") // italic (underscore form)
    .replace(/\*([^*]+)\*/g, "$1") // italic (asterisk form)
    .replace(/\n{3,}/g, "\n\n") // collapse extra blank lines
    .trim();
}

/** Splits text into TTS-call-sized chunks on paragraph boundaries (never
 *  mid-sentence where avoidable) so a long article becomes several
 *  playlist segments instead of one call that risks a provider-side
 *  length limit or a single point of failure. A lone paragraph longer
 *  than maxChars gets hard-split on sentence boundaries as a fallback.
 *
 *  Not currently called anywhere — the audiobook pipeline generates
 *  per-markdown-block instead (lib/ai/audiobook.ts's splitLongText),
 *  which is also where a real production bug in this same sentence-split
 *  regex got found and fixed (the `\s+` here never matches in Chinese
 *  prose — no space follows "。"/"！"/"？" — so long Chinese paragraphs
 *  never actually split into sentences before hitting maxChars; fixed
 *  below too so this doesn't become a landmine if it's ever wired up).
 *  audiobook.ts's version goes further (clause-level splitting on commas
 *  too, language-aware ceilings) — this one only gets the same minimal
 *  regex fix since it's dead code, not the full treatment. */
export function chunkForSpeech(text: string, maxChars = 1800): string[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    flush();
    if (para.length <= maxChars) {
      current = para;
      continue;
    }
    // A single paragraph longer than the limit — split on sentence
    // boundaries instead of dropping it or blowing past maxChars.
    const sentences = para.split(/(?<=[.!?。！？:：])\s*/).filter(Boolean);
    let piece = "";
    for (const sentence of sentences) {
      const withSentence = piece ? `${piece} ${sentence}` : sentence;
      if (withSentence.length <= maxChars) {
        piece = withSentence;
      } else {
        if (piece) chunks.push(piece.trim());
        piece = sentence.slice(0, maxChars); // last-resort hard cut
      }
    }
    if (piece.trim()) chunks.push(piece.trim());
  }
  flush();
  return chunks;
}

/** sha256 of the plain-text a generated audiobook was synthesized from —
 *  compared against a fresh hash of the current article text to detect
 *  "this audio is stale, the article changed since it was recorded"
 *  without storing/diffing the text itself. */
export function speechTextHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export interface TtsVoiceOption {
  id: string;
  label: string;
}

function parseVoiceList(raw: string | undefined): TtsVoiceOption[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((entry) => {
      const [id, label] = entry.split(":");
      return { id: (id ?? "").trim(), label: (label ?? id ?? "").trim() };
    })
    .filter((v) => v.id);
}

/** Voice choices for the classroom audiobook's voice dropdown, driven by
 *  env vars rather than a hardcoded list: agent-server's qwen3-tts runs
 *  through mlx-audio on the user's own Mac, and which voice names it
 *  actually supports depends entirely on that local deployment — this
 *  repo has no way to introspect it.
 *
 *  Split per language (TTS_VOICES_EN / TTS_VOICES_ZH) because a voice that
 *  sounds right narrating English prose usually isn't the right pick for
 *  Chinese prose (and vice versa) — showing one merged list on every
 *  article let you pick a mismatched voice/language pair with no warning.
 *  TTS_VOICES (no suffix) is kept as a shared fallback for either language
 *  if the split var isn't set, so existing single-list configs still work
 *  unchanged. Unset/empty (both the language-specific and shared var)
 *  returns [] and the classroom page just doesn't render a dropdown at
 *  all, falling back to whatever agent-server's own default voice is
 *  (same as before this feature existed). */
export function getTtsVoices(language: "en" | "zh"): TtsVoiceOption[] {
  const perLanguage = parseVoiceList(
    process.env[language === "zh" ? "TTS_VOICES_ZH" : "TTS_VOICES_EN"],
  );
  if (perLanguage.length > 0) return perLanguage;
  return parseVoiceList(process.env.TTS_VOICES);
}
