import type { JobStatus } from "@/lib/db/schema";

const QUEUED_TIMEOUT_MS = 2 * 60 * 1000;
const RUNNING_TIMEOUT_MS = 15 * 60 * 1000;

export function staleJobMessage(status: JobStatus, reference: Date, now = new Date()): string | null {
  const age = now.getTime() - reference.getTime();
  if (status === "queued" && age > QUEUED_TIMEOUT_MS) {
    return "This background job never started. Retry it; the previous worker did not accept the job.";
  }
  if (status === "running" && age > RUNNING_TIMEOUT_MS) {
    return "This background job timed out before completing. Retry it to start a fresh run.";
  }
  return null;
}
