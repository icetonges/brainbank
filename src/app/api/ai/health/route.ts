import { auth } from "@/auth";
import { localModelTag } from "@/lib/ai/providers";

export const runtime = "nodejs";

// How long to wait for agent-server's /health before giving up and
// reporting "offline" — without this, a hung Funnel connection (dead
// rather than actively refusing) would leave the status card stuck on
// "Checking…" indefinitely instead of surfacing a clear failure.
const HEALTH_TIMEOUT_MS = 8000;

interface HealthResult {
  configured: boolean;
  ok: boolean;
  statusCode?: number;
  latencyMs?: number;
  model: string;
  // True when the response body has a `build_step` field — per "local API
  // deployment.md" §2, that's the one field only agent-server returns,
  // distinguishing it from the legacy gateway.py bridge (which would
  // still respond, just without that field, if the Funnel URL were
  // pointed at the bare domain instead of :8443).
  isAgentServer?: boolean;
  error?: string;
  checkedAt: string;
}

/**
 * Server-side proxy for agent-server's /health — never called directly
 * from the client, because that would mean shipping LOCAL_LLM_SHARED_SECRET
 * to the browser. Requires a brainbank session for the same reason the
 * other /api/ai/* routes do: this reveals whether/how the self-hosted
 * backend is configured, which shouldn't be probeable anonymously.
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const checkedAt = new Date().toISOString();
  const baseURL = process.env.LOCAL_LLM_FUNNEL_URL;
  const apiKey = process.env.LOCAL_LLM_SHARED_SECRET;

  if (!baseURL || !apiKey) {
    const result: HealthResult = {
      configured: false,
      ok: false,
      model: localModelTag(),
      error: "not-configured",
      checkedAt,
    };
    return Response.json(result);
  }

  const url = `${baseURL.replace(/\/+$/, "")}/health`;
  const start = Date.now();

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      cache: "no-store",
    });
    const latencyMs = Date.now() - start;

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Non-JSON body — leave body null; status/latency are still
      // meaningful on their own.
    }
    const isAgentServer =
      typeof body === "object" && body !== null && "build_step" in (body as Record<string, unknown>);

    const result: HealthResult = {
      configured: true,
      ok: res.ok,
      statusCode: res.status,
      latencyMs,
      model: localModelTag(),
      isAgentServer,
      checkedAt,
    };
    return Response.json(result);
  } catch (err) {
    const result: HealthResult = {
      configured: true,
      ok: false,
      latencyMs: Date.now() - start,
      model: localModelTag(),
      error: err instanceof Error ? err.message : "unreachable",
      checkedAt,
    };
    return Response.json(result);
  }
}
