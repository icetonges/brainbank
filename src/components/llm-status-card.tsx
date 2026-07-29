"use client";

import { useCallback, useEffect, useState } from "react";

interface HealthResult {
  configured: boolean;
  ok: boolean;
  statusCode?: number;
  latencyMs?: number;
  model: string;
  isAgentServer?: boolean;
  error?: string;
  checkedAt: string;
}

interface LlmStatusStrings {
  statusTitle: string;
  statusChecking: string;
  statusOnline: string;
  statusOffline: string;
  statusNotConfigured: string;
  statusNotConfiguredHint: string;
  statusOfflineHint: string;
  statusUnverifiedHint: string;
  model: string;
  latency: string;
  lastChecked: string;
  refresh: string;
  refreshing: string;
}

type Status = "checking" | "online" | "offline" | "not-configured" | "unverified";

function deriveStatus(result: HealthResult | null): Status {
  if (!result) return "checking";
  if (!result.configured) return "not-configured";
  if (!result.ok) return "offline";
  if (result.isAgentServer === false) return "unverified";
  return "online";
}

const DOT_CLASS: Record<Status, string> = {
  checking: "bg-fg-secondary animate-pulse",
  online: "bg-green-500",
  offline: "bg-danger",
  "not-configured": "bg-fg-secondary",
  unverified: "bg-yellow-500",
};

/** Status card for the /llm page — fetches the server-side health proxy
 * (/api/ai/health, see that route for why this can't hit agent-server
 * directly from the client) on mount and on manual refresh. Never talks
 * to agent-server itself; LOCAL_LLM_SHARED_SECRET never reaches the
 * browser. */
export function LlmStatusCard({ s }: { s: LlmStatusStrings }) {
  const [result, setResult] = useState<HealthResult | null>(null);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/health", { cache: "no-store" });
      const data: HealthResult = await res.json();
      setResult(data);
    } catch {
      setResult({
        configured: true,
        ok: false,
        model: "",
        error: "request-failed",
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const status = loading ? "checking" : deriveStatus(result);

  const label =
    status === "checking"
      ? s.statusChecking
      : status === "online"
        ? s.statusOnline
        : status === "unverified"
          ? s.statusOnline
          : status === "not-configured"
            ? s.statusNotConfigured
            : s.statusOffline;

  const hint =
    status === "not-configured"
      ? s.statusNotConfiguredHint
      : status === "offline"
        ? s.statusOfflineHint
        : status === "unverified"
          ? s.statusUnverifiedHint
          : null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-bg-elevated p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
          {s.statusTitle}
        </h2>
        <button
          type="button"
          onClick={check}
          disabled={loading}
          className="rounded-md border border-border px-3 py-1 text-xs font-medium text-fg-secondary hover:border-accent hover:text-accent disabled:opacity-60 transition-colors"
        >
          {loading ? s.refreshing : s.refresh}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT_CLASS[status]}`} aria-hidden />
        <span className="font-medium text-fg">{label}</span>
      </div>

      {hint && <p className="text-sm text-fg-secondary">{hint}</p>}

      {result && result.configured && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-fg-secondary">{s.model}</dt>
            <dd className="text-fg">{result.model || "—"}</dd>
          </div>
          <div>
            <dt className="text-fg-secondary">{s.latency}</dt>
            <dd className="text-fg">
              {typeof result.latencyMs === "number" ? `${result.latencyMs}ms` : "—"}
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-2">
            <dt className="text-fg-secondary">{s.lastChecked}</dt>
            <dd className="text-fg">{new Date(result.checkedAt).toLocaleString()}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
