// One-time admin endpoint: deletes every page seeded by
// scripts/seed-deeplearningai-agentic-ai.ts / the sibling
// seed-deeplearningai-agentic-ai admin route — i.e. the entire
// "DeepLearningAI" classroom subcategory's "Agentic AI" section (40
// pages). The source study-guide content this section was built from
// turned out to be low quality (the study guide's own template, not this
// app's summarization — see the pages' near-identical structure), so the
// owner asked to remove them from the live site rather than keep
// polishing a translation of weak source material.
//
// Owner-only (same auth() gate as the seed route and every other write
// action in this app — see src/app/classroom/actions.ts's requireOwner).
// Trigger by visiting this URL in a browser while signed in as the owner:
//
//   https://<your-deployment>/api/admin/delete-deeplearningai-agentic-ai
//
// Deletes by slug prefix ("dlai-agentic-ai-") rather than by subcategory
// id, so it only ever touches rows this specific seed created — even if
// the "DeepLearningAI" subcategory or "Agentic AI" section name were ever
// reused for something else later, this route can't accidentally sweep
// that up. note_content, note_tags, and learning_guides all cascade-delete
// via the same FK constraints deleteClassroomArticle relies on (see
// schema.ts) — deleting the `notes` rows is enough.
//
// After the 40 notes are gone, also removes the now-empty "Agentic AI"
// section and "DeepLearningAI" subcategory rows themselves (only if
// nothing else is left in them), so the subcategory doesn't linger as a
// dangling, article-less entry. Safe to re-run: if the pages are already
// gone, this is a no-op that reports 0 deleted.
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notes, classroomSubcategories, classroomSections } from "@/lib/db/schema";
import { eq, and, like } from "drizzle-orm";

export const runtime = "nodejs";
// Reverted 500 -> 300 on 2026-09-01: pushes stopped producing any Vercel
// deployment at all (not a failed build with logs — no deployment showed up),
// consistent with the warning above: 500 only works with Fluid Compute
// enabled on this project, which isn't confirmed on. 300 is the hard ceiling
// on Hobby and the safe default on Pro without Fluid Compute. If Fluid
// Compute is verified on (Project Settings -> Functions) this can go back up.
export const maxDuration = 300;

const SUBCATEGORY_NAME = "DeepLearningAI";
const SECTION_NAME = "Agentic AI";
const SLUG_PREFIX = "dlai-agentic-ai-";

export async function GET() {
  const session = await auth();
  if (!session) {
    return new Response("Unauthorized — sign in as the owner first, then reload this URL.", {
      status: 401,
    });
  }

  // LIKE only supports "%"/"_" wildcards, not word boundaries, so
  // "dlai-agentic-ai-%" would also match the unrelated
  // "dlai-agentic-ai-lab-*" slugs from the separate "Agentic AI Lab"
  // section (see seed-deeplearningai-agentic-ai-lab.ts) — filter those
  // back out in JS rather than trying to encode a boundary in SQL.
  const LAB_SLUG_PREFIX = "dlai-agentic-ai-lab-";
  const candidates = await db.query.notes.findMany({
    where: like(notes.slug, `${SLUG_PREFIX}%`),
    columns: { id: true, slug: true, title: true },
  });
  const toDelete = candidates.filter((row) => !row.slug.startsWith(LAB_SLUG_PREFIX));

  for (const row of toDelete) {
    await db.delete(notes).where(eq(notes.id, row.id));
  }

  // Clean up the section/subcategory only if this route just emptied them
  // out completely — if the owner later re-seeds, ensureSection/
  // ensureSubcategory in the seed route will just recreate them.
  let sectionRemoved = false;
  let subcategoryRemoved = false;

  const subcategory = await db.query.classroomSubcategories.findFirst({
    where: eq(classroomSubcategories.name, SUBCATEGORY_NAME),
  });
  if (subcategory) {
    const section = await db.query.classroomSections.findFirst({
      where: and(
        eq(classroomSections.subcategoryId, subcategory.id),
        eq(classroomSections.name, SECTION_NAME),
      ),
    });
    if (section) {
      const remainingInSection = await db.query.notes.findFirst({
        where: eq(notes.sectionId, section.id),
      });
      if (!remainingInSection) {
        await db.delete(classroomSections).where(eq(classroomSections.id, section.id));
        sectionRemoved = true;
      }
    }

    const remainingInSubcategory = await db.query.notes.findFirst({
      where: eq(notes.subcategoryId, subcategory.id),
    });
    if (!remainingInSubcategory) {
      await db.delete(classroomSubcategories).where(eq(classroomSubcategories.id, subcategory.id));
      subcategoryRemoved = true;
    }
  }

  return Response.json({
    deletedCount: toDelete.length,
    deletedSlugs: toDelete.map((r) => r.slug),
    sectionRemoved,
    subcategoryRemoved,
    message:
      toDelete.length > 0
        ? `Deleted ${toDelete.length} page(s) under "${SUBCATEGORY_NAME}" > "${SECTION_NAME}".`
        : `No pages found with slug prefix "${SLUG_PREFIX}" — already deleted, or never seeded on this database.`,
  });
}
