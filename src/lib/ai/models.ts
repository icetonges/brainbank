// --- MODEL REGISTRY ---
//
// The single source of truth for which models this app can call. Nothing
// in the app talks to a provider SDK directly — everything goes through
// resolveModel() (providers.ts) and runTask() (tasks.ts), so adding a
// model here (including a future local/self-hosted one, see PLAN.md §6 and
// §14) is the only step needed to make it selectable everywhere.

export type ProviderId = "google" | "groq" | "anthropic";

export type ModelId =
  | "gemini-3.5-flash"
  | "gemini-3.1-flash-lite"
  | "gemini-2.5-flash"
  | "groq/compound"
  | "openai/gpt-oss-120b"
  | "openai/gpt-oss-20b"
  | "qwen/qwen3.6-27b"
  | "claude-sonnet-5"
  | "claude-opus-4-8"
  | "claude-haiku-4-5-20251001";

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
  // Google Gemini (via Google AI Studio)
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    provider: "google",
    providerLabel: "Google",
    providerColor: "#4285f4",
    inputPricePer1M: 1.5,
    outputPricePer1M: 9.0,
    contextWindow: "1M",
    description:
      "Flagship value model - ultimate balance of intelligence, speed, and deep thinking capabilities.",
    isFree: false,
    supportsVision: true,
    isDefault: true,
    badge: "Recommended",
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash-Lite",
    provider: "google",
    providerLabel: "Google",
    providerColor: "#4285f4",
    inputPricePer1M: 0.25,
    outputPricePer1M: 1.5,
    contextWindow: "1M",
    description:
      "High-volume agentic tasks - ultra-low latency option optimized for massive scale.",
    isFree: false,
    supportsVision: true,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    providerLabel: "Google",
    providerColor: "#4285f4",
    inputPricePer1M: 0.3,
    outputPricePer1M: 2.5,
    contextWindow: "1M",
    description:
      "Proven reasoning staple - exceptional price-to-performance ratio with 1M token context.",
    isFree: false,
    supportsVision: true,
  },

  // Groq -- Compound (agentic, built-in web search + code execution).
  // GA since Oct 1, 2025 — 'compound-beta' no longer exists.
  {
    id: "groq/compound",
    name: "Compound",
    provider: "groq",
    providerLabel: "Groq",
    providerColor: "#f55036",
    inputPricePer1M: 0,
    outputPricePer1M: 0,
    description:
      "Agentic system - built-in web search & code execution - up to 10 tool calls/request",
    contextWindow: "128K",
    isFree: true,
    supportsVision: false,
    badge: "Agentic",
  },

  // Groq -- OpenAI GPT-OSS. Groq's official replacements for the
  // deprecated Llama 3.x/4 lineup.
  {
    id: "openai/gpt-oss-120b",
    name: "GPT-OSS 120B",
    provider: "groq",
    providerLabel: "Groq",
    providerColor: "#f55036",
    inputPricePer1M: 0.15,
    outputPricePer1M: 0.6,
    description:
      "Flagship open-weight reasoning model - replaces Llama 4 Scout & Llama 3.3 70B - 128K",
    contextWindow: "128K",
    isFree: false,
    supportsVision: false,
    badge: "Recommended",
  },
  {
    id: "openai/gpt-oss-20b",
    name: "GPT-OSS 20B",
    provider: "groq",
    providerLabel: "Groq",
    providerColor: "#f55036",
    inputPricePer1M: 0.075,
    outputPricePer1M: 0.3,
    description:
      "Lightweight & ultra-fast (~1000 t/s) - replaces Llama 3.1 8B Instant - 128K",
    contextWindow: "128K",
    isFree: false,
    supportsVision: false,
    badge: "Fast",
  },
  {
    id: "qwen/qwen3.6-27b",
    name: "Qwen 3.6 27B",
    provider: "groq",
    providerLabel: "Groq",
    providerColor: "#f55036",
    inputPricePer1M: 0.6,
    outputPricePer1M: 3.0,
    description:
      "Multimodal (text + vision) - thinking/non-thinking modes - Groq preview - only vision option since Llama 4 Scout retires",
    contextWindow: "128K",
    isFree: false,
    supportsVision: true,
    badge: "Preview",
  },

  // Anthropic Claude (paid)
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: "anthropic",
    providerLabel: "Anthropic",
    providerColor: "#c85a3a",
    inputPricePer1M: 2,
    outputPricePer1M: 10,
    description:
      "Balanced performance - 200K - intro pricing through 8/31/26, then $3/$15",
    contextWindow: "200K",
    isFree: false,
    supportsVision: true,
    badge: "Balanced",
  },
  {
    id: "claude-opus-4-8",
    name: "Claude Opus 4.8",
    provider: "anthropic",
    providerLabel: "Anthropic",
    providerColor: "#c85a3a",
    inputPricePer1M: 5,
    outputPricePer1M: 25,
    description: "Most capable - 200K",
    contextWindow: "200K",
    isFree: false,
    supportsVision: true,
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    providerLabel: "Anthropic",
    providerColor: "#c85a3a",
    inputPricePer1M: 1,
    outputPricePer1M: 5,
    description: "Fastest Anthropic model - 200K",
    contextWindow: "200K",
    isFree: false,
    supportsVision: true,
  },
];

export const DEFAULT_MODEL_ID: ModelId =
  MODELS.find((m) => m.isDefault)?.id ?? "gemini-3.5-flash";

export function getModel(id: ModelId): ModelInfo {
  const model = MODELS.find((m) => m.id === id);
  if (!model) throw new Error(`Unknown model id: ${id}`);
  return model;
}

export function getModelsByProvider(provider: ProviderId): ModelInfo[] {
  return MODELS.filter((m) => m.provider === provider);
}

export const FREE_MODELS = MODELS.filter((m) => m.isFree);
