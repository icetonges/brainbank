// --- MODEL REGISTRY ---
//
// The single source of truth for which models this app can call. Nothing
// in the app talks to a provider SDK directly — everything goes through
// resolveModel() (providers.ts) and runTask() (tasks.ts), so adding a
// model here is the only step needed to make it selectable everywhere.
//
// Two local chat models run through the same self-hosted agent-server (see
// HANDOFF-FOR-WINDOWS.md §2 — verified by reading Ollama's manifests
// directly on the Mac; a third model, nomic-embed-text, exists on the same
// server but is embedding-only and deliberately NOT registered here — it's
// not a chat model and must never show up in a picker). gpt-oss:120b (the
// former third local entry) was removed outright — it couldn't coexist in
// VRAM with the other two, and every selection of it paid a 60+ second
// cold-load tax, which made it a poor fit for an automatic fallback chain.
// Its replacement as the chain's last resort is a real commercial API —
// google/gemini-2.5-flash-lite (see providers.ts's google() factory) —
// re-adding Google (previously pulled out entirely per explicit
// instruction, alongside Groq/Anthropic) specifically and only as that
// last-ditch fallback: cheap, fast, and doesn't depend on the Mac being
// awake or Funnel being reachable, unlike every local entry. Re-adding
// another external provider later is still just a provider() factory in
// providers.ts, a MODELS entry, and a line in FALLBACK_CHAIN, same as
// before.

export type ProviderId = "local" | "google";

export type ModelId =
  | "local/qwen3.6-35b-a3b"
  | "local/qwen3-vl-30b"
  | "google/gemini-2.5-flash-lite";

export interface ModelInfo {
  id: ModelId;
  name: string;
  provider: ProviderId;
  providerLabel: string;
  providerColor: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
  description: string;
  contextWindow: string;
  isFree: boolean;
  supportsVision: boolean;
  isDefault?: boolean;
  badge?: string;
  // The exact Ollama model tag sent over the wire (see resolveModel() in
  // providers.ts) — HANDOFF-FOR-WINDOWS.md §2 is explicit that these must
  // be used exactly; an unrecognized tag makes Ollama try to *download*
  // it, "which is not something a web request should be able to trigger."
  // Only the default entry's tag can still be overridden via the
  // LOCAL_LLM_MODEL env var (backward-compatible with the single-model
  // setup this registry replaces) — the other two are always exactly this.
  wireId: string;
  // Set on a model that can't coexist with the others in the Mac's VRAM
  // (see HANDOFF-FOR-WINDOWS.md §2's VRAM-constraint table) — selecting it
  // evicts whatever was loaded and the first request after waits for a
  // full cold load (tens of seconds to over a minute). The picker UI
  // surfaces this as an explicit warning. Nothing currently registered
  // sets this (the one local model that did, gpt-oss:120b, was removed —
  // see this file's header comment) but the flag/warning machinery stays
  // in place for if a heavy local model is ever added back.
  heavy?: boolean;
}

export const MODELS: ModelInfo[] = [
  // Mixture-of-experts — only ~3B params active per token despite the
  // 35B/22.3 GiB size, which is why it's the fastest of the two local
  // models (measured 72 tokens/sec on the Mac). Default for every task.
  {
    id: "local/qwen3.6-35b-a3b",
    name: "Qwen3.6 35B (fast, default)",
    provider: "local",
    providerLabel: "Local",
    providerColor: "#16a34a",
    inputPricePer1M: 0,
    outputPricePer1M: 0,
    description:
      "Self-hosted agent-server via Tailscale Funnel — private, no external API, no per-token cost. Mixture-of-experts (~3B active params/token), the fastest of the two local models (~72 tok/s). Requires LOCAL_LLM_FUNNEL_URL + LOCAL_LLM_SHARED_SECRET and the Mac to be awake/reachable.",
    contextWindow: "varies",
    isFree: true,
    supportsVision: false,
    isDefault: true,
    badge: "Local",
    wireId: "qwen3.6:35b-a3b",
  },
  // The only local model that accepts image input (vision-language) — the
  // Google fallback also supports vision, but this one is free/private and
  // never called unless it's the preferred choice or both other chain
  // entries fail. Coexists in VRAM alongside the default model (40.5 GiB
  // combined, both stay warm — see the handoff doc's table), so switching
  // to this one and back stays fast (no evict/reload cycle).
  {
    id: "local/qwen3-vl-30b",
    name: "Qwen3-VL 30B (vision)",
    provider: "local",
    providerLabel: "Local",
    providerColor: "#16a34a",
    inputPricePer1M: 0,
    outputPricePer1M: 0,
    description:
      "Self-hosted agent-server via Tailscale Funnel — private, no external API, no per-token cost. Vision-language — the only local model that accepts images. Fits in VRAM alongside the default model, so it stays warm.",
    contextWindow: "varies",
    isFree: true,
    supportsVision: true,
    badge: "Local",
    wireId: "qwen3-vl:30b",
  },
  // Commercial fallback — the chain's last resort (see FALLBACK_CHAIN
  // below), used only when both local models have failed. Google's Gemini
  // API, not the self-hosted agent-server: costs real money per token and
  // needs internet + GOOGLE_GENERATIVE_AI_API_KEY, but doesn't depend on
  // the Mac being awake or Tailscale Funnel being reachable — the one
  // failure mode nothing local can protect against (see tasks.ts's
  // withFallback/isInfraFailure comments). Flash-Lite specifically: cheap
  // and fast enough to be a reasonable last-resort rather than a
  // budget-buster, per Google's published pricing.
  {
    id: "google/gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash-Lite (commercial fallback)",
    provider: "google",
    providerLabel: "Google",
    providerColor: "#4285f4",
    inputPricePer1M: 0.1,
    outputPricePer1M: 0.4,
    description:
      "Google Gemini API — commercial, real per-token cost, requires internet and GOOGLE_GENERATIVE_AI_API_KEY. Only used as the fallback chain's last resort, when both local models have failed — doesn't depend on the Mac being awake or Funnel being reachable.",
    contextWindow: "1M tokens",
    isFree: false,
    supportsVision: true,
    badge: "Commercial",
    wireId: "gemini-2.5-flash-lite",
  },
];

// --- FALLBACK CHAIN ---
//
// The order tasks.ts tries models in when a call fails (rate limit, spend
// cap, outage, whatever) — not just a config table but an actual runtime
// fallback (see withFallback() in tasks.ts). Ordered fastest/most-reliable
// first: the default local model, then the local vision model (which stays
// warm alongside it — see MODELS above), then the commercial Google
// fallback last. The first two entries share the same agent-server, so
// they don't protect against the Mac being asleep or Funnel being down —
// what they protect against is one specific local model erroring or
// timing out while the other is fine. The third entry is different in
// kind, not just order: it's the one thing in this chain that keeps
// working when the Mac/Funnel itself is unreachable (see
// isInfraFailure()'s "shared provider" early-exit in tasks.ts — Google is
// a different ProviderId, so it's never skipped by that optimization),
// at the cost of a real per-token bill instead of $0. When a task
// explicitly requests a specific model (e.g. the classroom composer's
// model picker), chainFor() in tasks.ts puts that choice first and appends
// the rest of this chain after it — so picking the Gemini fallback
// directly still means "try Gemini, then fall back to the local models if
// it fails," not "only ever use Gemini."
export const FALLBACK_CHAIN: ModelId[] = [
  "local/qwen3.6-35b-a3b",
  "local/qwen3-vl-30b",
  "google/gemini-2.5-flash-lite",
];

export const DEFAULT_MODEL_ID: ModelId =
  MODELS.find((m) => m.isDefault)?.id ?? FALLBACK_CHAIN[0];

// --- LOCAL-ONLY CHAIN (PRIVACY BOUNDARY) ---
//
// FALLBACK_CHAIN with every non-local model stripped out. This is not a
// performance tweak — it's a hard privacy boundary for diary content.
//
// The diary holds the most personal text in this app, and the explicit
// decision (see lib/knowledge/distill.ts) is that raw entries are processed
// ONLY by the self-hosted agent-server and never reach a commercial API,
// even as a last-resort fallback. Passing `localOnly: true` through
// withFallback() in tasks.ts makes that structural rather than a
// convention someone could forget: the Google entry is removed from the
// candidate list entirely, so there is no code path where a diary
// extraction call can end up at Google, however many local models fail
// first. The cost is real and accepted — when the Mac is asleep, diary
// distillation fails and is retried later rather than silently succeeding
// somewhere else.
//
// Knowledge SYNTHESIS (insights over already-distilled atoms) deliberately
// does NOT use this chain: atoms are one abstraction step removed from raw
// diary text, and availability matters more there.
export const LOCAL_ONLY_CHAIN: ModelId[] = FALLBACK_CHAIN.filter(
  (id) => MODELS.find((m) => m.id === id)?.provider === "local",
);

// --- EMBEDDINGS ---
//
// The embedding model on the same agent-server (see this file's header —
// deliberately NOT in MODELS, since it's not a chat model and must never
// appear in a picker). Used by lib/ai/embeddings.ts to vectorize knowledge
// atoms for similarity matching. 768 dimensions — must stay in sync with
// EMBEDDING_DIMENSIONS in db/schema.ts.
export const EMBEDDING_WIRE_ID = "nomic-embed-text";

// --- MEDIA MODELS (text-to-speech / speech-to-text / image) ---
//
// Non-chat capabilities on the SAME self-hosted agent-server as the chat
// models above — deliberately not added to MODELS/ModelInfo (no token
// pricing, context window, or vision semantics apply to "synthesize this
// text as audio"), same reasoning as EMBEDDING_WIRE_ID staying separate.
// All three go through lib/ai/media.ts, which calls agent-server's
// OpenAI-compatible /v1/audio/speech, /v1/audio/transcriptions, and
// /v1/images/generations — gated by the SAME LOCAL_LLM_FUNNEL_URL /
// LOCAL_LLM_SHARED_SECRET as chat (providers.ts's local()), not a second
// pair of env vars: one agent-server process fronts all of it. Each
// capability depends on agent-server's own backing service being
// configured on its side (TTS_SERVICE_URL for mlx-audio, STT_SERVICE_URL
// for whisper-cli, IMAGE_GEN_SERVICE_URL for image_server.py) — until
// then agent-server itself returns a 501 with a clear explanation, which
// media.ts passes through rather than masking as a generic failure.
export const TTS_WIRE_ID = "qwen3-tts";
export const STT_WIRE_ID = "whisper-large-v3-turbo";
export const IMAGE_WIRE_ID = "flux.2-klein";
// No video-generation entry yet — LTX-2.3 is still a documented TODO on
// agent-server's side (no OpenAI-standard response shape exists to call
// yet, per the integration guide). Add a *_WIRE_ID here plus a media.ts
// function the same way once that route exists server-side.

// --- AGENTIC MODELS ---
//
// Models with autonomous tool use (web search, code execution) baked into
// the model itself by the provider, not something the caller opts into —
// this mattered when groq/compound was registered (it decided on its own,
// mid-request, whether to search the web or run code, which broke
// grounded tasks like translate that must operate only on the text they
// were given — see git history for the incident). No agentic model is
// currently registered, so this is empty, but the exclusion mechanism
// (GROUNDED_FALLBACK_CHAIN below, applied via withFallback's `grounded`
// option in tasks.ts) stays in place for when one is re-added.
export const AGENTIC_MODELS: ModelId[] = [];

/** FALLBACK_CHAIN with agentic models removed — what every task except
 * the AI Assist chat actually falls through (see withFallback in
 * tasks.ts). */
export const GROUNDED_FALLBACK_CHAIN: ModelId[] = FALLBACK_CHAIN.filter(
  (id) => !AGENTIC_MODELS.includes(id),
);

// --- MODELS THAT CAN'T BE TRUSTED FOR generateObject ---
//
// generateObject (tag-and-link, draft, publish-assist, and translate's
// structured note fields) needs the model to actually honor a JSON schema,
// not just "usually return JSON". The default local model has been
// observed returning schema-non-conformant responses (tags as a
// comma-separated string instead of an array, resources as strings instead
// of {title,url,description} objects, handsOn as an array instead of a
// string) — every local model shares the same agent-server, which per
// HANDOFF-FOR-WINDOWS.md doesn't support strict structured-output
// enforcement (response_format is best-effort JSON, not a hard schema).
// providers.ts's local() now sets supportsStructuredOutputs: true as an
// experiment to revisit that finding (agent-server is actively versioned
// and may have gained real json_schema support since) — if that pans out
// it should reduce how often these mismatches happen, but doesn't
// guarantee they stop, so none of the three are excluded here regardless;
// that would just mean generateObject tasks have nowhere to go if the
// experiment doesn't pan out. The fix that doesn't depend on that
// experiment lives in tasks.ts: every generateObject system prompt spells
// out the exact JSON shape with a concrete example, and the schemas use
// z.preprocess() to coerce the specific shape mistakes observed (string
// -> array, string -> best-effort object, wrong field names entirely)
// before validation runs, so a near-miss response still gets used instead
// of being thrown out.
//
// This list is for models with a *structural*, unpromptable rejection
// (e.g. the Groq qwen model formerly registered here hard-rejected
// `response_format: json_schema` with a 400 no matter what the prompt
// said) — worth excluding on sight since retrying is pointless. Nothing
// currently registered fits that description.
export const NO_STRUCTURED_OUTPUT_MODELS: ModelId[] = [];

/** GROUNDED_FALLBACK_CHAIN with the models in NO_STRUCTURED_OUTPUT_MODELS
 * removed — what every generateObject-based task (tag-and-link, draft,
 * publish-assist, translate's structured note fields) falls through. */
export const OBJECT_FALLBACK_CHAIN: ModelId[] = GROUNDED_FALLBACK_CHAIN.filter(
  (id) => !NO_STRUCTURED_OUTPUT_MODELS.includes(id),
);

export function getModel(id: ModelId): ModelInfo {
  const model = MODELS.find((m) => m.id === id);
  if (!model) throw new Error(`Unknown model id: ${id}`);
  return model;
}

export function getModelsByProvider(provider: ProviderId): ModelInfo[] {
  return MODELS.filter((m) => m.provider === provider);
}

export const FREE_MODELS = MODELS.filter((m) => m.isFree);
