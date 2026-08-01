import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { ingestSource } from "@/lib/inngest/ingest-source";
import { syncObsidianVault } from "@/lib/inngest/sync-obsidian";
import { distillDiary } from "@/lib/inngest/distill-diary";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [ingestSource, syncObsidianVault, distillDiary],
});
