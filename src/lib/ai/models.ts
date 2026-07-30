// --- MODEL REGISTRY ---
//
// The single source of truth for which models this app can call. Nothing
// in the app talks to a provider SDK directly — everything goes through
// resolveModel() (providers.ts) and runTask() (tasks.ts), so adding a
// model here is the only step needed to make it selectable everywhere.
//
// FOR NOW, every registered model runs through the same local self-hosted
// agent-server — Google/Groq/Anthropic were deliberately pulled out (per
// explicit instruction) so that backend is the only place any AI feature
// can call, not just the preferred/first-tried one in a fallback chain.
// The three entries below are the three chat models actually available on
// that one agent-server (see HANDOFF-FOR-WINDOWS.md §2 — verified by
// reading Ollama's manifests directly on the Mac; a fourth model,
// nomic-embed-text, exists on the same server but is embedding-only and
// deliberately NOT registered here — it's not a chat model and must never
// show up in a picker). Re-adding an external provider later is still just
// a provider() factory in providers.ts, a MODELS entry, and a line in
// FALLBACK_CHAIN, same as before.

export type ProviderId = "local";

export type ModelId =
  | "local/qwen3.6-35b-a3b"
  | "local/qwen3-vl-30b"
  | "local/gpt-oss-120b";

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
  // (see HANDOFF-FOR-WINDOWS.md §2's "gpt-oss:120b constraint" table) —
  // selecting it evicts whatever was loaded and the first request after
  // waits for a full cold load (tens of seconds to over a minute). The
  // picker UI surfaces this as an explicit warning; per the handoff doc,
  // "Don't remove those warnings."
  heavy?: boolean;
}

export const MODELS: ModelInfo[] = [
  // Mixture-of-experts — only ~3B params active per token despite the
  // 35B/22.3 GiB size, which is why it's the fastest of the three
  // (measured 72 tokens/sec on the Mac). Default for every task.
  {
    id: "local/qwen3.6-35b-a3b",
    name: "Qwen3.6 35B (fast, default)",
    provider: "local",
    providerLabel: "Local",
    providerColor: "#16a34a",
    inputPricePer1M: 0,
    outputPricePer1M: 0,
    description:
      "Self-hosted agent-server via Tailscale Funnel — private, no external API, no per-token cost. Mixture-of-experts (~3B active params/token), the fastest of the three local models (~72 tok/s). Requires LOCAL_LLM_FUNNEL_URL + LOCAL_LLM_SHARED_SECRET and the Mac to be awake/reachable.",
    contextWindow: "varies",
    isFree: true,
    supportsVision: false,
    isDefault: true,
    badge: "Local",
    wireId: "qwen3.6:35b-a3b",
  },
  // The only one of the three that accepts image input (vision-language).
  // Coexists in VRAM alongside the default model (40.5 GiB combined, both
  // stay warm — see the handoff doc's table), so switching to this one and
  // back doesn't trigger the slow evict/reload cycle gpt-oss:120b does.
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
  // Largest/most capable, but cannot be co-resident with either other
  // model (77.8 GiB VRAM total; this alone is 60.9 GiB, and both other
  // pairings with it exceed the limit — see the handoff doc's table).
  // Selecting it evicts whatever was loaded; the next request waits for a
  // full cold load of ~65 GB, which can take 60+ seconds.
  {
    id: "local/gpt-oss-120b",
    name: "GPT-OSS 120B (largest, slow to switch to)",
    provider: "local",
    providerLabel: "Local",
    providerColor: "#16a34a",
    inputPricePer1M: 0,
    outputPricePer1M: 0,
    description:
      "Self-hosted agent-server via Tailscale Funnel — private, no external API, no per-token cost. The largest and most capable of the three, but can't share VRAM with the other two — selecting it evicts whatever else was loaded and the next request waits for a full cold load.",
    contextWindow: "varies",
    isFree: true,
    supportsVision: false,
    badge: "Local",
    wireId: "gpt-oss:120b",
    heavy: true,
  },
];

// --- FALLBACK CHAIN ---
//
// The order tasks.ts tries models in when a call fails (rate limit, spend
// cap, outage, whatever) — not just a config table but an actual runtime
// fallback (see withFallback() in tasks.ts). All three chain entries run
// through the same agent-server, so this doesn't protect against the Mac
// being asleep or Funnel being down (every model fails together in that
// case) — what it does protect against is one specific model erroring or
// timing out (a cold-load timeout on gpt-oss:120b, a transient agent_loop
// failure, etc.) while the others are fine. Ordered fastest/most-reliable
// first: the default model, then the vision model (which stays warm
// alongside it — see MODELS above), then the heavyweight model last since
// falling through to it costs a slow VRAM swap. When a task explicitly
// requests a specific model (e.g. the classroom composer's model picker),
// chainFor() in tasks.ts puts that choice first and appends the rest of
// this chain after it — so picking gpt-oss:120b still means "try gpt-oss,
// then fall back to the other two if it fails," not "only ever use
// gpt-oss."
export const FALLBACK_CHAIN: ModelId[] = [
  "local/qwen3.6-35b-a3b",
  "local/qwen3-vl-30b",
  "local/gpt-oss-120b",
];

export const DEFAULT_MODEL_ID: ModelId =
  MODELS.find((m) => m.isDefault)?.id ?? FALLBACK_CHAIN[0];

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
// enforcement (response_format is best-effort JSON, not a hard schema), so
// none of the three are excluded here; that would just mean generateObject
// tasks have nowhere to go. The fix lives in tasks.ts instead: every
// generateObject system prompt spells out the
// exact JSON shape with a concrete example, and the schemas use
// z.preprocess() to coerce the specific shape mistakes observed (string
// -> array, string -> best-effort object) before validation runs, so a
// near-miss response still gets used instead of being thrown out.
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
