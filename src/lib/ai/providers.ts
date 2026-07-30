import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { DEFAULT_MODEL_ID, getModel, type ModelId, type ProviderId } from "./models";

// One place that knows how to turn a provider id into an actual AI SDK
// client. Everything else in the app calls resolveModel(modelId) and never
// imports an @ai-sdk/* package directly — that keeps this swappable
// (PLAN.md §6): adding a provider back later means adding one more
// factory function here plus a case in PROVIDER_FACTORIES, not touching
// every call site. Google/Groq/Anthropic factories (@ai-sdk/google,
// @ai-sdk/groq, @ai-sdk/anthropic) were removed from here — and from
// package.json — per explicit instruction to run on local only, "for
// now". See models.ts's header comment for what re-adding one looks like.

// Default local model tag, only used when LOCAL_LLM_MODEL isn't set — kept
// in sync with DEFAULT_MODEL_ID's wireId in models.ts (currently
// "qwen3.6:35b-a3b"). See HANDOFF-FOR-WINDOWS.md §2.
const DEFAULT_LOCAL_MODEL = "qwen3.6:35b-a3b";

/** The wire model tag for the DEFAULT local model specifically —
 * LOCAL_LLM_MODEL if set, else DEFAULT_LOCAL_MODEL. Exported so the
 * /api/ai/health route can show it without duplicating this fallback.
 * Only the default entry honors this env override (backward-compatible
 * with the single-model setup this registry replaces) — the other two
 * registered models (local/qwen3-vl-30b, local/gpt-oss-120b) always use
 * their exact wireId from models.ts, since LOCAL_LLM_MODEL was only ever
 * meant to say "which one model," not "remap any of the three." */
export function localModelTag(): string {
  return process.env.LOCAL_LLM_MODEL || DEFAULT_LOCAL_MODEL;
}

function local() {
  const baseURL = process.env.LOCAL_LLM_FUNNEL_URL;
  const apiKey = process.env.LOCAL_LLM_SHARED_SECRET;
  if (!baseURL || !apiKey) {
    throw new Error(
      "LOCAL_LLM_FUNNEL_URL / LOCAL_LLM_SHARED_SECRET are not set. See \"local API deployment.md\" — create a key with keys_admin.py on the agent-server Mac, then set both vars locally (.env.local) and in Vercel. This is the only configured provider right now (all three registered models run through it), so every AI feature in the app is down until this is set.",
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
  });
}

const PROVIDER_FACTORIES: Record<ProviderId, () => { (id: string): LanguageModel }> = {
  local,
};

/** Resolve a model id from the registry into a ready-to-use AI SDK model. */
export function resolveModel(modelId: ModelId): LanguageModel {
  const info = getModel(modelId);
  const factory = PROVIDER_FACTORIES[info.provider];
  const client = factory();
  // Each local registry entry carries its own exact Ollama tag (info.wireId
  // — see models.ts) since agent-server hosts three distinct chat models on
  // one endpoint now, not one swappable model. The DEFAULT entry alone
  // keeps the LOCAL_LLM_MODEL env override for backward compatibility; the
  // other two always use their hardcoded wireId, matching
  // HANDOFF-FOR-WINDOWS.md §2's "Model ID (use exactly)" instruction.
  const wireModelId =
    info.provider === "local"
      ? info.id === DEFAULT_MODEL_ID
        ? localModelTag()
        : info.wireId
      : info.id;
  return client(wireModelId);
}

/** Which providers currently have credentials configured. */
export function configuredProviders(): Record<ProviderId, boolean> {
  return {
    local: Boolean(process.env.LOCAL_LLM_FUNNEL_URL && process.env.LOCAL_LLM_SHARED_SECRET),
  };
}
