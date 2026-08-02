import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { syncObsidianVault } from "@/lib/inngest/sync-obsidian";
import { distillDiary } from "@/lib/inngest/distill-diary";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [syncObsidianVault, distillDiary],
});
