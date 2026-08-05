// One-time admin endpoint: seeds the "DeepLearningAI" classroom
// subcategory with a new "Agentic AI Lab" section of 7 bilingual (EN + ZH)
// pages — the 7 real DeepLearning.AI lab notebooks the user uploaded.
// Same data and upsert logic as scripts/seed-deeplearningai-agentic-ai-lab.ts;
// see that script's header for the full rationale (script vs. route,
// idempotent upsert-by-slug) — it mirrors
// src/app/api/admin/seed-deeplearningai-agentic-ai/route.ts's pattern.
//
// Owner-only (same auth() gate as every other write action in this app).
// Trigger by visiting this URL in a browser while signed in as the owner:
//
//   https://<your-deployment>/api/admin/seed-deeplearningai-agentic-ai-lab
//
// Idempotent — re-visiting updates existing rows (matched by slug) rather
// than duplicating them.
//
// Supports optional ?from=N&to=M query params (1-7, inclusive) to seed a
// subset of pages per request; see maxDuration below and vercel.json's
// "src/app/api/admin/**" glob (already covers this route).
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  notes,
  noteContent,
  classroomSubcategories,
  classroomSections,
  tags,
  noteTags,
  learningGuides,
} from "@/lib/db/schema";
import { subcategorySlug, RESERVED_TOP_LEVEL_SLUGS } from "@/lib/slug";
import { ALL_PAGES, type SeedPage } from "@/lib/seed-data/deeplearningai-agentic-ai-lab";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 500;

const SUBCATEGORY_NAME = "DeepLearningAI";
const SECTION_NAME = "Agentic AI Lab";

function pageSlug(page: SeedPage): string {
  return `dlai-agentic-ai-lab-${String(page.order).padStart(2, "0")}-${page.key}`;
}

async function ensureSubcategory(): Promise<{ id: number; created: boolean }> {
  const existing = await db.query.classroomSubcategories.findFirst({
    where: eq(classroomSubcategories.name, SUBCATEGORY_NAME),
  });
  if (existing) return { id: existing.id, created: false };

  let slug = subcategorySlug(SUBCATEGORY_NAME);
  if (RESERVED_TOP_LEVEL_SLUGS.has(slug)) slug = `${slug}1`;
  let suffix = 1;
  while (
    await db.query.classroomSubcategories.findFirst({ where: eq(classroomSubcategories.slug, slug) })
  ) {
    suffix += 1;
    slug = `${subcategorySlug(SUBCATEGORY_NAME)}-${suffix}`;
  }

  const [row] = await db
    .insert(classroomSubcategories)
    .values({ name: SUBCATEGORY_NAME, slug })
    .returning();
  return { id: row.id, created: true };
}

async function ensureSection(subcategoryId: number): Promise<{ id: number; created: boolean }> {
  const existing = await db.query.classroomSections.findFirst({
    where: and(
      eq(classroomSections.subcategoryId, subcategoryId),
      eq(classroomSections.name, SECTION_NAME),
    ),
  });
  if (existing) return { id: existing.id, created: false };

  const [row] = await db
    .insert(classroomSections)
    .values({ name: SECTION_NAME, subcategoryId, sortOrder: 0 })
    .returning();
  return { id: row.id, created: true };
}

async function ensureTag(name: string): Promise<number> {
  const normalized = name.trim().toLowerCase();
  let tag = await db.query.tags.findFirst({ where: eq(tags.name, normalized) });
  if (!tag) {
    [tag] = await db.insert(tags).values({ name: normalized }).returning();
  }
  return tag.id;
}

async function applyTags(noteId: number, tagNames: string[]) {
  for (const name of tagNames) {
    const tagId = await ensureTag(name);
    const existingLink = await db.query.noteTags.findFirst({
      where: and(eq(noteTags.noteId, noteId), eq(noteTags.tagId, tagId)),
    });
    if (!existingLink) {
      await db.insert(noteTags).values({ noteId, tagId });
    }
  }
}

async function upsertNoteContent(
  noteId: number,
  language: "en" | "zh",
  values: { title?: string; bodyMarkdown: string; summary: string },
) {
  const existing = await db.query.noteContent.findFirst({
    where: and(eq(noteContent.noteId, noteId), eq(noteContent.language, language)),
  });
  if (existing) {
    await db.update(noteContent).set(values).where(eq(noteContent.id, existing.id));
  } else {
    await db.insert(noteContent).values({ noteId, language, ...values });
  }
}

async function upsertLearningGuide(noteId: number, page: SeedPage) {
  const values = {
    learningMap: page.learningMapEn,
    handsOn: page.handsOnEn,
    learningMapZh: page.learningMapZh,
    handsOnZh: page.handsOnZh,
    resources: page.resources,
    updatedAt: new Date(),
  };
  const existing = await db.query.learningGuides.findFirst({ where: eq(learningGuides.noteId, noteId) });
  if (existing) {
    await db.update(learningGuides).set(values).where(eq(learningGuides.id, existing.id));
  } else {
    await db.insert(learningGuides).values({ noteId, ...values });
  }
}

async function upsertPage(page: SeedPage, subcategoryId: number, sectionId: number) {
  const slug = pageSlug(page);
  const title = page.titleEn;

  const existing = await db.query.notes.findFirst({ where: eq(notes.slug, slug) });

  let noteId: number;
  if (existing) {
    await db
      .update(notes)
      .set({
        title,
        status: "published",
        category: page.category,
        subcategoryId,
        sectionId,
        sectionOrder: page.order,
        primaryLanguage: "en",
        updatedAt: new Date(),
      })
      .where(eq(notes.id, existing.id));
    noteId = existing.id;
  } else {
    const [row] = await db
      .insert(notes)
      .values({
        slug,
        title,
        status: "published",
        sourceType: "manual",
        category: page.category,
        subcategoryId,
        sectionId,
        sectionOrder: page.order,
        primaryLanguage: "en",
      })
      .returning();
    noteId = row.id;
  }

  await upsertNoteContent(noteId, "en", { bodyMarkdown: page.bodyEn, summary: page.summaryEn });
  await upsertNoteContent(noteId, "zh", {
    title: page.titleZh,
    bodyMarkdown: page.bodyZh,
    summary: page.summaryZh,
  });

  await upsertLearningGuide(noteId, page);
  await applyTags(noteId, [...page.tags, page.category]);

  return { slug, action: existing ? ("updated" as const) : ("created" as const) };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return new Response("Unauthorized — sign in as the owner first, then reload this URL.", {
      status: 401,
    });
  }

  const url = new URL(req.url);
  const fromParam = Number(url.searchParams.get("from") ?? "1");
  const toParam = Number(url.searchParams.get("to") ?? String(ALL_PAGES.length));
  const from = Number.isFinite(fromParam) ? Math.max(1, Math.floor(fromParam)) : 1;
  const to = Number.isFinite(toParam) ? Math.min(ALL_PAGES.length, Math.floor(toParam)) : ALL_PAGES.length;

  const pagesToRun = ALL_PAGES.filter((p) => p.order >= from && p.order <= to);
  if (pagesToRun.length === 0) {
    return Response.json(
      { error: `No pages in range from=${from} to=${to} (valid range: 1-${ALL_PAGES.length}).` },
      { status: 400 },
    );
  }

  const subcategory = await ensureSubcategory();
  const section = await ensureSection(subcategory.id);

  const results: { order: number; slug: string; action: "created" | "updated" }[] = [];
  for (const page of pagesToRun) {
    const result = await upsertPage(page, subcategory.id, section.id);
    results.push({ order: page.order, ...result });
  }

  const created = results.filter((r) => r.action === "created").length;
  const updated = results.filter((r) => r.action === "updated").length;

  return Response.json({
    subcategory: { name: SUBCATEGORY_NAME, created: subcategory.created },
    section: { name: SECTION_NAME, created: section.created },
    range: { from, to, totalPages: ALL_PAGES.length },
    created,
    updated,
    results,
    nextSteps:
      to < ALL_PAGES.length
        ? `Continue with ?from=${to + 1}&to=${ALL_PAGES.length} to seed the rest.`
        : "All requested pages seeded. View at /classroom.",
  });
}
