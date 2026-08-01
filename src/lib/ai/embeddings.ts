import { EMBEDDING_WIRE_ID } from "./models";
import { EMBEDDING_DIMENSIONS } from "@/lib/db/schema";

// --- EMBEDDINGS ---
//
// Vectorizes knowledge-atom statements so the distillation step can ask
// "do I already believe something like this?" semantically rather than by
// keyword. That question is the whole difference between a knowledge base
// that REINFORCES what it knows and one that just accumulates near-
// duplicates forever (see lib/knowledge/distill.ts).
//
// Deliberately hand-rolled fetch rather than going through the AI SDK:
// nomic-embed-text is not — and must not be — a registered chat model (see
// models.ts's header), so it has no MODELS entry and can't go through
// resolveModel().
//
// PROTOCOL DETECTION: agent-server is a custom bridge, and which embedding
// route it exposes isn't guaranteed. Rather than hardcoding one and failing
// if it's the other, this tries the three plausible shapes in order and
// remembers whichever answers:
//   1. POST /v1/embeddings   — OpenAI-compatible, batch  {data:[{embedding}]}
//   2. POST /api/embed       — Ollama (newer), batch     {embeddings:[[…]]}
//   3. POST /api/embeddings  — Ollama (older), single    {embedding:[…]}
// Run ./check-embeddings.ps1 to see which one your server actually answers.
//
// Same privacy boundary as diary distillation: this only ever talks to the
// self-hosted Mac. There is deliberately no commercial-embedding fallback —
// if agent-server is unreachable, embedding fails and the caller degrades
// to keyword matching (see similarAtomsByKeyword) rather than sending
// personal text somewhere else.

const EMBED_TIMEOUT_MS = 30_000;

export class EmbeddingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingUnavailableError";
  }
}

type Protocol = "openai" | "ollama-batch" | "ollama-single";

const PROTOCOLS: { id: Protocol; path: string; batch: boolean }[] = [
  { id: "openai", path: "/v1/embeddings", batch: true },
  { id: "ollama-batch", path: "/api/embed", batch: true },
  { id: "ollama-single", path: "/api/embeddings", batch: false },
];

// Remembered across calls within a server instance so we probe once, not
// on every distillation. Reset to null on failure so a server that comes
// back up (or gets an embeddings route added) is re-detected without a
// redeploy.
let detected: Protocol | null = null;

function config(): { baseURL: string; apiKey: string } {
  const baseURL = process.env.LOCAL_LLM_FUNNEL_URL;
  const apiKey = process.env.LOCAL_LLM_SHARED_SECRET;
  if (!baseURL || !apiKey) {
    throw new EmbeddingUnavailableError(
      "LOCAL_LLM_FUNNEL_URL / LOCAL_LLM_SHARED_SECRET are not set — knowledge atoms can't be embedded, so similarity matching falls back to keywords.",
    );
  }
  return { baseURL: baseURL.replace(/\/+$/, ""), apiKey };
}

/** Pulls the vectors out of whichever response shape came back. */
function extractVectors(body: unknown): number[][] | null {
  const b = body as {
    data?: { embedding?: number[] }[];
    embeddings?: number[][];
    embedding?: number[];
  };
  if (Array.isArray(b?.data) && b.data.every((d) => Array.isArray(d?.embedding))) {
    return b.data.map((d) => d.embedding as number[]);
  }
  if (Array.isArray(b?.embeddings) && b.embeddings.every(Array.isArray)) {
    return b.embeddings;
  }
  if (Array.isArray(b?.embedding)) return [b.embedding];
  return null;
}

async function callOnce(
  proto: { id: Protocol; path: string; batch: boolean },
  texts: string[],
): Promise<number[][]> {
  const { baseURL, apiKey } = config();

  // The single-input protocol needs one request per text.
  const batches = proto.batch ? [texts] : texts.map((t) => [t]);
  const out: number[][] = [];

  for (const batch of batches) {
    const payload = proto.batch
      ? { model: EMBEDDING_WIRE_ID, input: batch }
      : { model: EMBEDDING_WIRE_ID, prompt: batch[0] };

    const res = await fetch(`${baseURL}${proto.path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) {
      throw new EmbeddingUnavailableError(
        `${proto.path} returned ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    }

    const vectors = extractVectors(await res.json());
    if (!vectors || vectors.length !== batch.length) {
      throw new EmbeddingUnavailableError(
        `${proto.path} returned an unrecognized body (expected ${batch.length} embedding(s))`,
      );
    }
    out.push(...vectors);
  }

  // A dimension mismatch means the embedding model changed underneath us.
  // Failing loudly beats writing vectors pgvector will reject on insert —
  // or worse, silently comparing incompatible spaces.
  const wrong = out.find((v) => v.length !== EMBEDDING_DIMENSIONS);
  if (wrong) {
    throw new EmbeddingUnavailableError(
      `Expected ${EMBEDDING_DIMENSIONS}-dimension embeddings (${EMBEDDING_WIRE_ID}) but got ${wrong.length}. Update EMBEDDING_DIMENSIONS in db/schema.ts, re-run db:push, and re-embed existing atoms.`,
    );
  }

  return out;
}

/**
 * Embeds a batch of strings, returning one vector per input in order.
 * Throws EmbeddingUnavailableError when agent-server isn't configured or
 * has no working embeddings route — callers catch that and fall back to
 * keyword matching rather than failing the whole distillation.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Fast path: use the protocol we already know works.
  if (detected) {
    const proto = PROTOCOLS.find((p) => p.id === detected)!;
    try {
      return await callOnce(proto, texts);
    } catch (err) {
      // Forget it and re-probe below — the server may have changed, or
      // this could be a transient failure on an otherwise-fine route.
      detected = null;
      if (err instanceof EmbeddingUnavailableError && err.message.includes("dimension")) {
        throw err; // a real misconfiguration; probing other routes won't help
      }
    }
  }

  const failures: string[] = [];
  for (const proto of PROTOCOLS) {
    try {
      const vectors = await callOnce(proto, texts);
      detected = proto.id;
      console.log(`[knowledge] embeddings via ${proto.path} (${proto.id})`);
      return vectors;
    } catch (err) {
      failures.push(
        `${proto.path}: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  }

  throw new EmbeddingUnavailableError(
    `No working embeddings endpoint on agent-server. Tried:\n  ${failures.join("\n  ")}\nRun ./check-embeddings.ps1, and make sure "ollama pull ${EMBEDDING_WIRE_ID}" has been run on the Mac.`,
  );
}

/** Single-string convenience wrapper around embedTexts. */
export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}

/**
 * embedTexts that returns nulls instead of throwing — the shape most
 * callers want, since a missing embedding should degrade matching quality,
 * not abort a distillation run. The atom is still stored; the "Backfill
 * embeddings" button on /assistant fills the vector in later.
 */
export async function embedTextsOrNull(texts: string[]): Promise<(number[] | null)[]> {
  try {
    return await embedTexts(texts);
  } catch (err) {
    console.error("[knowledge] embedding unavailable, falling back to keyword matching", err);
    return texts.map(() => null);
  }
}
