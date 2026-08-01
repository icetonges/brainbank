import { inngest } from "./client";
import { distillDiaryEntry } from "@/lib/knowledge/distill";

export interface DistillEventData {
  noteId: number;
}

/**
 * Executes one distillation without depending on Inngest Cloud
 * registration — same escape hatch as runIngestionDirect, and the path
 * actually taken in production via `after()` (see background-jobs.ts).
 */
export async function runDistillDirect(data: DistillEventData) {
  return distillDiaryEntry(data.noteId);
}

// Distillation is a background job for the same reason ingestion is: it
// makes several sequential local-model calls (one extraction plus one
// reconcile per candidate atom against each near-match), which on a cold
// or busy agent-server can easily outlast a request. Saving a diary entry
// must never wait on that — the entry is written and the page returns
// immediately, and knowledge appears a minute later.
//
// retries: 2 matters more here than for ingestion. The single most likely
// failure is "the Mac was asleep" — a transient, retryable condition, and
// because diary work is local-only by design (see LOCAL_ONLY_CHAIN in
// models.ts) there's no commercial fallback to paper over it. An entry
// that fails all retries keeps diaryEntries.distilledAt null and gets
// picked up by the catch-up backlog on /assistant.
export const distillDiary = inngest.createFunction(
  {
    id: "distill-diary",
    retries: 2,
    triggers: [{ event: "diary/distill.requested" }],
  },
  async ({ event, step }) => {
    return step.run("distill-entry", () => runDistillDirect(event.data as DistillEventData));
  },
);
