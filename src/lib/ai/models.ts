// --- MODEL REGISTRY ---
//
// The single source of truth for which models this app can call. Nothing
// in the app talks to a provider SDK directly — everything goes through
// resolveModel() (providers.ts) and runTask() (tasks.ts), so adding a
// model here is the only step needed to make it selectable everywhere.
//
// FOR NOW, this registry holds only the local self-hosted model — Google/
// Groq/Anthropic were deliberately pulled out (per explicit instruction)
// so the local agent-server is the only place any AI feature can call,
// not just the preferred/first-tried one in a fallback chain. The
// fallback-chain machinery below (FALLBACK_CHAIN, GROUNDED_FALLBACK_CHAIN,
// OBJECT_FALLBACK_CHAIN, AGENTIC_MODELS, NO_STRUCTURED_OUTPUT_MODELS) is
// left in place even though it only has one model to chain through right
// now — it costs nothing to keep, and re-adding a provider later is just
// adding a provider() factory in providers.ts, a MODELS entry, and a line
// in FALLBACK_CHAIN, same as before this removal.

export type ProviderId = "local";

export type ModelId = "local/default";

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
}

export const MODELS: ModelInfo[] = [
  // Local self-hosted agent-server (Mac + Tailscale Funnel), see
  // "local API deployment.md". No external API call, no per-token cost.
  // The actual model tag sent over the wire comes from LOCAL_LLM_MODEL
  // (see resolveModel() in providers.ts) rather than this id, so switching
  // which local model you're running is a single env var change, not a
  // code change or a new registry entry.
  {
    id: "local/default",
    name: "Local (self-hosted)",
    provider: "local",
    providerLabel: "Local",
    providerColor: "#16a34a",
    inputPricePer1M: 0,
    outputPricePer1M: 0,
    description:
      "Self-hosted agent-server via Tailscale Funnel — private, no external API, no per-token cost. Requires LOCAL_LLM_FUNNEL_URL + LOCAL_LLM_SHARED_SECRET and the Mac to be awake/reachable.",
    contextWindow: "varies",
    isFree: true,
    supportsVision: false,
    isDefault: true,
    badge: "Local",
  },
];

// --- FALLBACK CHAIN ---
//
// The order tasks.ts tries models in when a call fails (rate limit, spend
// cap, outage, whatever) — not just a config table but an actual runtime
// fallback (see withFallback() in tasks.ts). Only local/default is
// registered right now, so this chain has exactly one entry and there is
// no real fallback destination — if the Mac is asleep or agent-server is
// unreachable, every AI feature fails outright instead of quietly using a
// different provider. That's the accepted tradeoff of removing every
// other model; re-add entries here (and a matching MODELS/providers.ts
// entry) to restore redundancy.
export const FALLBACK_CHAIN: ModelId[] = ["local/default"];

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
// not just "usually return JSON". local/default has been observed
// returning a schema-non-conformant response (tags as a comma-separated
// string instead of an array, resources as strings instead of
// {title,url,description} objects) — since it's the only registered
// model, it stays in the chain regardless (excluding it here would mean
// generateObject tasks have nowhere to go at all). The fix lives in
// tasks.ts instead: every generateObject system prompt spells out the
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
