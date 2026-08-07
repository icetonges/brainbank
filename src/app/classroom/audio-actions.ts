"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { generateArticleAudio } from "@/lib/ai/audiobook";
import { attachMediaAction } from "@/app/notes/[slug]/actions";

// Same "maxDuration lives on the invoking page" situation as the rest of
// classroom/actions.ts (see the long comment there) — classroom/[slug]/
// page.tsx already exports maxDuration=500 and vercel.json covers
// src/app/classroom/** at the platform level, so generateArticleAudioAction
// (called from a <form action> on that page) inherits both without needing
// anything here.
//
// The actual generation logic lives in lib/ai/audiobook.ts's
// generateArticleAudio, shared with scripts/generate-audiobooks.ts — see
// that script's header for why bulk generation is better run locally
// (direct LAN/Tailscale access to agent-server, no Vercel maxDuration)
// than by repeatedly clicking Generate through this Server Action.

async function requireOwner() {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
}

/**
 * Owner-only wrapper around lib/ai/audiobook.ts's generateArticleAudio:
 * resolves which voice to use (dropdown selection, falling back to
 * TTS_DEFAULT_VOICE), generates the audiobook, catalogs it into the
 * `media` table (attachMediaAction — same reason the composers log every
 * upload there: one consistent place that answers "what storage does
 * this note own," independent of which feature generated it), and
 * revalidates the article page so the new audio shows up immediately.
 */
export async function generateArticleAudioAction(
  noteId: number,
  slug: string,
  language: "en" | "zh",
  formData: FormData,
) {
  await requireOwner();

  // Resolved ONCE per generation run and reused for every block's TTS
  // call inside generateArticleAudio — if this ends up undefined (no
  // dropdown selection AND no TTS_DEFAULT_VOICE configured), whatever
  // voice agent-server picks when `voice` is omitted is entirely up to
  // it. If that's a random pick per call rather than a stable default,
  // the symptom is an audiobook that sounds like a different narrator
  // every paragraph — set TTS_DEFAULT_VOICE (or pick one from the
  // dropdown, once TTS_VOICES is configured) to rule that out.
  const voice =
    (formData.get("voice") as string | null)?.trim() || process.env.TTS_DEFAULT_VOICE || undefined;

  const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
  if (!note) throw new Error("Article not found");

  const { segments, totalBytes } = await generateArticleAudio(noteId, language, voice);

  await attachMediaAction(noteId, slug, {
    kind: "audio",
    provider: "r2",
    url: segments[0].url,
    sizeBytes: totalBytes,
    mimeType: "audio/mpeg",
  });

  revalidatePath(`/classroom/${slug}`);
}
