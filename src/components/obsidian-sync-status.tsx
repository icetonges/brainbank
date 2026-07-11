"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobStatus } from "@/lib/db/schema";

interface Props {
  initialStatus: JobStatus | null;
  initialFilesTotal: number | null;
  initialFilesProcessed: number | null;
  initialFilesFailed: number | null;
  initialError: string | null;
}

interface StatusPayload {
  status: JobStatus | null;
  filesTotal: number | null;
  filesProcessed: number | null;
  filesFailed: number | null;
  error: string | null;
}

const POLL_MS = 2500;

export function ObsidianSyncStatus({
  initialStatus,
  initialFilesTotal,
  initialFilesProcessed,
  initialFilesFailed,
  initialError,
}: Props) {
  const router = useRouter();
  const [state, setState] = useState<StatusPayload>({
    status: initialStatus,
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
    return (
      <p className="text-fg-secondary">
        Last sync: {state.filesProcessed ?? 0} note{state.filesProcessed === 1 ? "" : "s"} synced
        {state.filesFailed ? `, ${state.filesFailed} failed` : ""}.
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
