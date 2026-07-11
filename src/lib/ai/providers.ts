import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";
import { getModel, type ModelId, type ProviderId } from "./models";

// One place that knows how to turn a provider id into an actual AI SDK
// client. Everything else in the app calls resolveModel(modelId) and never
// imports an @ai-sdk/* package directly — that's what keeps the chain
// swappable (PLAN.md §6): adding a local/self-hosted model later means
// adding one more case here (e.g. an OpenAI-compatible client pointed at
// your own endpoint), not touching every call site.

function google() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey",
    );
  }
  return createGoogleGenerativeAI({ apiKey });
}

function groq() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys",
    );
  }
  return createGroq({ apiKey });
}

function anthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }
  return createAnthropic({ apiKey });
}

const PROVIDER_FACTORIES: Record<ProviderId, () => { (id: string): LanguageModel }> = {
  google,
  groq,
  anthropic,
};

/** Resolve a model id from the registry into a ready-to-use AI SDK model. */
export function resolveModel(modelId: ModelId): LanguageModel {
  const info = getModel(modelId);
  const factory = PROVIDER_FACTORIES[info.provider];
  const client = factory();
  return client(info.id);
}

/** Which providers currently have an API key configured. */
export function configuredProviders(): Record<ProviderId, boolean> {
  return {
    google: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    groq: Boolean(process.env.GROQ_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}
