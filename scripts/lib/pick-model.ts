// Shared "local LLM first, Gemini as fallback" model selection for every
// unattended fetch script under scripts/ (fetch-trends.ts,
// fetch-github-trending.ts) — factored out once a second script needed the
// exact same logic, rather than duplicating the reasoning below twice.
//
// The local models (default: qwen3.6-35b-a3b) run on the owner's own Mac,
// reached via a public Tailscale Funnel URL + shared-secret header — see
// src/lib/ai/providers.ts's local() and models.ts's header comment. That's a
// real public HTTPS endpoint, so unlike a private Tailscale mesh address, a
// GitHub Actions runner genuinely *can* reach it. What it can't guarantee is
// that the Mac is awake and Funnel is up at whatever moment the cron fires —
// an unattended run has no one to notice and wake it, unlike an interactive
// request from the app. So: try local first (free, private, matches "local
// by default"), and silently fall through to the Gemini commercial
// fallback — same FALLBACK_CHAIN order the rest of the app uses — if the
// local call fails for any reason. A run where the Mac happened to be
// asleep still produces output; it's just paid for that one run instead of
// free.
import { generateText, type LanguageModel } from "ai";
import { resolveModel } from "../../src/lib/ai/providers";
import { DEFAULT_MODEL_ID } from "../../src/lib/ai/models";

export async function pickModel(
  logPrefix: string,
): Promise<{ model: LanguageModel; label: "local" | "gemini" }> {
  const localConfigured = Boolean(process.env.LOCAL_LLM_FUNNEL_URL && process.env.LOCAL_LLM_SHARED_SECRET);

  if (localConfigured) {
    try {
      const local = resolveModel(DEFAULT_MODEL_ID); // "local/qwen3.6-35b-a3b"
      // resolveModel() only builds the client — this is the actual
      // reachability probe, so a sleeping Mac / down Funnel is caught here
      // rather than mid-way through real generations.
      await generateText({
        model: local,
        prompt: "Reply with just: ok",
        maxOutputTokens: 10,
        abortSignal: AbortSignal.timeout(15_000),
      });
      console.log(`${logPrefix} Local LLM reachable — using it for this run.`);
      return { model: local, label: "local" };
    } catch (err) {
      console.warn(
        `${logPrefix} Local LLM unreachable (Mac asleep, or Funnel down?) — falling back to Gemini for this run:`,
        err instanceof Error ? err.message : err,
      );
    }
  } else {
    console.log(`${logPrefix} LOCAL_LLM_FUNNEL_URL/LOCAL_LLM_SHARED_SECRET not set for this run — using Gemini.`);
  }

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error(
      "Local LLM unavailable and GOOGLE_GENERATIVE_AI_API_KEY is not set — nothing left in the chain to generate with.",
    );
  }
  return { model: resolveModel("google/gemini-2.5-flash-lite"), label: "gemini" };
}
