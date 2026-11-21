"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobStatus } from "@/lib/db/schema";

interface Props {
  initialStatus: JobStatus | null;
  initialFilesScanned: number | null;
  initialFilesTotal: number | null;
  initialFilesProcessed: number | null;
  initialFilesFailed: number | null;
  initialError: string | null;
}

interface StatusPayload {
  status: JobStatus | null;
  filesScanned: number | null;
  filesTotal: number | null;
  filesProcessed: number | null;
  filesFailed: number | null;
  error: string | null;
}

/** Poll cadence while a sync is in flight. Each poll is a Vercel Function
 * invocation (the route authenticates and queries), and a sync that stalls in
 * "running" with the page left open used to hold a flat 2.5s forever: ~1,440
 * invocations an hour for a progress bar nobody is watching. Back off toward
 * POLL_MAX_MS instead, and reset to the fast cadence the moment the tab is
 * brought back to the foreground. */
const POLL_MIN_MS = 2500;
const POLL_MAX_MS = 20000;
const POLL_BACKOFF = 1.6;

export function ObsidianSyncStatus({
  initialStatus,
  initialFilesScanned,
  initialFilesTotal,
  initialFilesProcessed,
  initialFilesFailed,
  initialError,
}: Props) {
  const router = useRouter();
  const [state, setState] = useState<StatusPayload>({
    status: initialStatus,
    filesScanned: initialFilesScanned,
    filesTotal: initialFilesTotal,
    filesProcessed: initialFilesProcessed,
    filesFailed: initialFilesFailed,
    error: initialError,
  });

  useEffect(() => {
    if (state.status !== "queued" && state.status !== "running") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = POLL_MIN_MS;

    function schedule() {
      timer = setTimeout(tick, delay);
      delay = Math.min(delay * POLL_BACKOFF, POLL_MAX_MS);
    }

    async function tick() {
      if (cancelled) return;
      // A hidden tab's progress readout isn't being read, so don't spend an
      // invocation on it — reschedule and let onVisibilityChange below fire
      // an immediate poll when the tab comes back.
      if (document.hidden) {
        schedule();
        return;
      }
      try {
        const res = await fetch("/api/obsidian-sync-status");
        if (res.ok) {
          const data: StatusPayload = await res.json();
          if (cancelled) return;
          setState(data);
          if (data.status === "succeeded" || data.status === "failed") {
            // Terminal: stop here rather than rescheduling. The status change
            // re-runs this effect, which bails at the guard above.
            router.refresh();
            return;
          }
        }
      } catch {
        // transient network hiccup — the next poll will retry
      }
      schedule();
    }

    function onVisibilityChange() {
      if (document.hidden) return;
      delay = POLL_MIN_MS;
      if (timer) clearTimeout(timer);
      void tick();
    }

    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [state.status, router]);

  if (!state.status) {
    return <p className="text-fg-secondary">No sync has run yet.</p>;
  }

  if (state.status === "succeeded") {
    // Distinguish "imported N notes" from "found the vault but nothing
    // changed" — the latter used to display as a bare "0 notes synced",
    // which reads like a failure when the real story is up-to-date (or a
    // vault that only ever had one file).
    if (!state.filesProcessed && state.filesScanned) {
      return (
        <p className="text-fg-secondary">
          Last sync: everything up to date — scanned {state.filesScanned} vault{" "}
          {state.filesScanned === 1 ? "note" : "notes"}, none changed since the last import.
        </p>
      );
    }
    return (
      <p className="text-fg-secondary">
        Last sync: {state.filesProcessed ?? 0} note{state.filesProcessed === 1 ? "" : "s"} synced
        {state.filesFailed ? `, ${state.filesFailed} failed` : ""}
        {state.filesScanned ? ` (${state.filesScanned} scanned)` : ""}.
      </p>
    );
  }

  if (state.status === "failed") {
    return (
      <div>
        <p className="text-danger">Sync failed.</p>
        {state.error && <p className="mt-1 text-sm text-fg-secondary">{state.error}</p>}
      </div>
    );
  }

  return (
    <p className="text-fg-secondary">
      <span className="mr-2 inline-block animate-pulse text-accent">●</span>
      Syncing
      {state.filesTotal ? ` — ${state.filesProcessed ?? 0}/${state.filesTotal} files` : "…"}
    </p>
  );
}
