import { db } from "@/lib/db";
import { ingestionJobs } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const runtime = "nodejs";

// Polled by IngestStatusBanner while a note is processing. Not
// auth-gated — published notes are public read, and job status isn't
// sensitive.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const noteId = Number(searchParams.get("noteId"));
  if (!noteId) return new Response("noteId is required", { status: 400 });

  const job = await db.query.ingestionJobs.findFirst({
    where: eq(ingestionJobs.noteId, noteId),
    orderBy: desc(ingestionJobs.createdAt),
  });

  if (!job) return Response.json({ status: "succeeded", stage: null, error: null });

  return Response.json({ status: job.status, stage: job.stage, error: job.error });
}
