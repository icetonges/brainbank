"use server";

import { auth } from "@/auth";
import { inngest } from "@/lib/inngest/client";
import { createSyncRun } from "@/lib/obsidian/persist";
import { isObsidianSyncConfigured } from "@/lib/obsidian/github";
import { revalidatePath } from "next/cache";

export async function triggerObsidianSyncAction() {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
  if (!isObsidianSyncConfigured()) {
    throw new Error("GITHUB_TOKEN / GITHUB_OBSIDIAN_REPO are not set — see .env.example");
  }

  const runId = await createSyncRun();

  await inngest.send({
    name: "obsidian/sync.requested",
    data: { runId },
  });

  revalidatePath("/obsidian");
}
