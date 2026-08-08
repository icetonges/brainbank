import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { DEFAULT_MODEL_ID, getModel, type ModelId, type ProviderId } from "./models";

// One place that knows how to turn a provider id into an actual AI SDK
// client. Everything else in the app calls resolveModel(modelId) and never
// imports an @ai-sdk/* package directly — that keeps this swappable
// (PLAN.md §6): adding a provider back later means adding one more
// factory function here plus a case in PROVIDER_FACTORIES, not touching
// every call site. Groq/Anthropic factories (@ai-sdk/groq,
// @ai-sdk/anthropic) are still removed from here — and from package.json —
// per the original explicit instruction to run on local only. Google
// (@ai-sdk/google) is the one exception, re-added specifically to back
// google/gemini-2.5-flash-lite as the fallback chain's commercial last
// resort — see models.ts's header comment for why.

// Default local model tag, only used when LOCAL_LLM_MODEL isn't set — kept
// in sync with DEFAULT_MODEL_ID's wireId in models.ts (currently
// "qwen3.6:35b-a3b"). See HANDOFF-FOR-WINDOWS.md §2.
const DEFAULT_LOCAL_MODEL = "qwen3.6:35b-a3b";

/** The wire model tag for the DEFAULT local model specifically —
 * LOCAL_LLM_MODEL if set, else DEFAULT_LOCAL_MODEL. Exported so the
 * /api/ai/health route can show it without duplicating this fallback.
 * Only the default entry honors this env override (backward-compatible
 * with the single-model setup this registry replaces) — the other local
 * model (local/qwen3-vl-30b) always uses its exact wireId from models.ts,
 * since LOCAL_LLM_MODEL was only ever meant to say "which one model," not
 * "remap either local one." */
export function localModelTag(): string {
  return process.env.LOCAL_LLM_MODEL || DEFAULT_LOCAL_MODEL;
}

function local() {
  const baseURL = process.env.LOCAL_LLM_FUNNEL_URL;
  const apiKey = process.env.LOCAL_LLM_SHARED_SECRET;
  if (!baseURL || !apiKey) {
    throw new Error(
      "LOCAL_LLM_FUNNEL_URL / LOCAL_LLM_SHARED_SECRET are not set. See \"local API deployment.md\" — create a key with keys_admin.py on the agent-server Mac, then set both vars locally (.env.local) and in Vercel. Both local models (models.ts) run through this, so every AI feature falls straight through to the commercial Google fallback (or fails outright if that's not configured either) until this is set.",
    );
  }
  // agent-server speaks the OpenAI chat-completions wire format at
  // <funnel-url>:8443/v1/chat/completions (per the deployment guide), so a
  // generic OpenAI-compatible client — not the official OpenAI SDK, which
  // targets api.openai.com's newer Responses API by default — is the
  // correct fit here.
  return createOpenAICompatible({
    name: "local-llm",
    baseURL: `${baseURL.replace(/\/+$/, "")}/v1`,
    apiKey,
    // EXPERIMENT (see models.ts's NO_STRUCTURED_OUTPUT_MODELS comment for
    // the prior finding this revisits): previously left false/unset, which
    // is why every generateObject call in tasks.ts/fetch-trends.ts has had
    // to lean on prompt-only JSON instructions plus manual schema coercion
    // — HANDOFF-FOR-WINDOWS.md documented agent-server's response_format as
    // best-effort only, not a real schema. Flipping this to true makes the
    // AI SDK send response_format: {type:"json_schema", strict:true} with
    // the actual schema instead of just prompting for JSON and hoping,
    // which — IF agent-server/Ollama honors it (Ollama's own OpenAI-compat
    // endpoint supports json_schema mode on recent versions; unclear
    // whether this custom FastAPI wrapper passes it through) — would fix
    // the field-naming/shape mismatches at the source via constrained
    // decoding rather than working around them after the fact. Worth
    // retrying since agent-server is actively versioned (currently
    // "0.8.0-step5.7-streaming" per its own health response) and may have
    // changed since that doc was written. If it turns out agent-server
    // still can't honor this — rejects the request outright, or silently
    // ignores it with no change in behavior — revert this one flag; every
    // existing coercion/no_think safety net in tasks.ts and
    // fetch-trends.ts stays in place regardless and keeps working either
    // way, so this is a pure upside-or-neutral bet, not a replacement for
    // them.
    supportsStructuredOutputs: true,
  });
}

// The Gemini API client — separate from local()'s OpenAI-compatible shim
// since this talks to Google's own endpoint/wire format directly via the
// official @ai-sdk/google provider, not agent-server. createGoogleGenerativeAI
// also reads GOOGLE_GENERATIVE_AI_API_KEY itself if apiKey is omitted, but
// passing it explicitly here keeps the same "fail loudly with a clear
// message" behavior as local() instead of a client that silently exists
// but 401s on first use.
function google() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY is not set. Get a key at https://aistudio.google.com/apikey and set it locally (.env.local) and in Vercel — this is the fallback chain's last resort (models.ts), so its absence just means that last step never has anywhere to go, not that every AI feature is down (the two local models ahead of it in the chain still work).",
    );
  }
  return createGoogleGenerativeAI({ apiKey });
}

const PROVIDER_FACTORIES: Record<ProviderId, () => { (id: string): LanguageModel }> = {
  local,
  google,
};

/** Resolve a model id from the registry into a ready-to-use AI SDK model. */
export function resolveModel(modelId: ModelId): LanguageModel {
  const info = getModel(modelId);
  const factory = PROVIDER_FACTORIES[info.provider];
  const client = factory();
  // Each local registry entry carries its own exact Ollama tag (info.wireId
  // — see models.ts) since agent-server hosts two distinct chat models on
  // one endpoint, not one swappable model. The DEFAULT entry alone keeps
  // the LOCAL_LLM_MODEL env override for backward compatibility; the
  // vision entry always uses its hardcoded wireId, matching
  // HANDOFF-FOR-WINDOWS.md §2's "Model ID (use exactly)" instruction. The
  // Google entry isn't part of that override — it always uses its own
  // wireId (models.ts's "gemini-2.5-flash-lite") regardless.
  const wireModelId =
    info.provider === "local"
      ? info.id === DEFAULT_MODEL_ID
        ? localModelTag()
        : info.wireId
      : info.wireId;
  return client(wireModelId);
}

/** Which providers currently have credentials configured. */
export function configuredProviders(): Record<ProviderId, boolean> {
  return {
    local: Boolean(process.env.LOCAL_LLM_FUNNEL_URL && process.env.LOCAL_LLM_SHARED_SECRET),
    google: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
  };
}
