"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { retryIngestionAction } from "@/app/notes/[slug]/actions";
import type { JobStatus } from "@/lib/db/schema";

interface Props {
  noteId: number;
  slug: string;
  initialStatus: JobStatus;
  initialStage: string | null;
  initialError: string | null;
}

const POLL_MS = 3000;

export function IngestStatusBanner({
  noteId,
  slug,
  initialStatus,
  initialStage,
  initialError,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<JobStatus>(initialStatus);
  const [stage, setStage] = useState(initialStage);
  const [error, setError] = useState(initialError);

  useEffect(() => {
    if (status !== "queued" && status !== "running") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/ingest-status?noteId=${noteId}`);
        if (!res.ok) return;
        const data: { status: JobStatus; stage: string | null; error: string | null } =
          await res.json();
        setStatus(data.status);
        setStage(data.stage);
        setError(data.error);
        if (data.status === "succeeded") router.refresh();
      } catch {
        // transient network hiccup — next poll will retry
      }
    }, POLL_MS);

    return () => clearInterval(interval);
  }, [status, noteId, router]);

  if (status === "succeeded") return null;

  const retryAction = retryIngestionAction.bind(null, noteId, slug);

  return (
    <div
      className={`rounded-lg border p-4 ${
        status === "failed" ? "border-danger/40" : "border-accent/40"
      } bg-bg-elevated`}
    >
      {status === "failed" ? (
        <>
          <p className="font-medium text-fg">Auto-build failed.</p>
          {error && <p className="mt-1 text-sm text-fg-secondary">{error}</p>}
          <form action={retryAction} className="mt-3">
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:border-accent hover:text-accent transition-colors"
            >
              Retry
            </button>
          </form>
        </>
      ) : (
        <p className="text-fg-secondary">
          <span className="mr-2 inline-block animate-pulse text-accent">●</span>
          Processing{stage ? ` — ${stage}` : ""}…
        </p>
      )}
    </div>
  );
}
