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

const POLL_MS = 2500;

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

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/obsidian-sync-status");
        if (!res.ok) return;
        const data: StatusPayload = await res.json();
        setState(data);
        if (data.status === "succeeded" || data.status === "failed") router.refresh();
      } catch {
        // transient network hiccup — next poll will retry
      }
    }, POLL_MS);

    return () => clearInterval(interval);
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
