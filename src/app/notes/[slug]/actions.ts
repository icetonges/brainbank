"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import type { MediaKind, MediaProvider } from "@/lib/db/schema";
import { revalidatePath } from "next/cache";

// This file used to back the full /notes/[slug] view/edit/delete flow for
// manually-created "Knowledge" pages — that feature (the +Knowledge nav
// button, /new, /notes/[slug], and its own note-ingestion pipeline) has
// been removed. attachMediaAction survives here because it's generic,
// shared infra: the diary composer and classroom composer both call it to
// attach a pasted/dropped image to *their own* note (a diary entry or a
// classroom article), not just a manual note — moving it would just be
// churn for no behavior change.

async function requireOwner() {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
}

export async function attachMediaAction(
  noteId: number,
  slug: string,
  input: {
    kind: MediaKind;
    provider: MediaProvider;
    url: string;
    sizeBytes: number;
    mimeType: string;
  },
) {
  await requireOwner();

  await db.insert(media).values({
    noteId,
    kind: input.kind,
    provider: input.provider,
    url: input.url,
    sizeBytes: input.sizeBytes,
    mimeType: input.mimeType,
  });

  revalidatePath(`/notes/${slug}`);
}
