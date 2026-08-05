// Seeds the "DeepLearningAI" classroom subcategory with a new "Agentic AI
// Lab" section of 7 bilingual (EN + ZH) pages — the 7 real DeepLearning.AI
// lab notebooks the user uploaded (Module 2 Section 4, Module 2 Section 7,
// Module 3 Section 4, Module 3 Section 5, Module 4 Section 5, Module 5
// Section 4, Module 5 Section 6). English bodies are byte-for-byte copies
// of the uploaded files; Chinese bodies are full hand-written
// translations of the narrative text only (code/prompts/JSON left as-is —
// see src/lib/seed-data/deeplearningai-agentic-ai-lab/all-pages.ts).
//
// This is a distinct section from "Agentic AI" (deleted — that one was
// built from generic template source material, not real lab content), so
// it uses its own slug prefix ("dlai-agentic-ai-lab-") and won't collide
// with or resurrect anything from that deletion.
//
// Same standalone-script/admin-route pattern as
// scripts/seed-deeplearningai-agentic-ai.ts — see that file's header for
// the full rationale (why a script AND a route exist, why relative
// imports, why idempotent upsert-by-slug).
//
// Run locally with:
//   npx tsx scripts/seed-deeplearningai-agentic-ai-lab.ts
// Needs DATABASE_URL — auto-loaded from .env.local if not already set.

import fs from "node:fs";
import path from "node:path";

function loadDotEnvLocalIfNeeded() {
  if (process.env.DATABASE_URL) return;
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnvLocalIfNeeded();

import { eq, and } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  notes,
  noteContent,
  classroomSubcategories,
  classroomSections,
  tags,
  noteTags,
  learningGuides,
} from "../src/lib/db/schema";
import { subcategorySlug, RESERVED_TOP_LEVEL_SLUGS } from "../src/lib/slug";
import { ALL_PAGES, type SeedPage } from "../src/lib/seed-data/deeplearningai-agentic-ai-lab";

const SUBCATEGORY_NAME = "DeepLearningAI";
const SECTION_NAME = "Agentic AI Lab";

function pageSlug(page: SeedPage): string {
  return `dlai-agentic-ai-lab-${String(page.order).padStart(2, "0")}-${page.key}`;
}

async function ensureSubcategory(): Promise<number> {
  const existing = await db.query.classroomSubcategories.findFirst({
    where: eq(classroomSubcategories.name, SUBCATEGORY_NAME),
  });
  if (existing) return existing.id;

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
  console.log(`[seed] Created subcategory "${SUBCATEGORY_NAME}" (slug: ${slug}, id: ${row.id})`);
  return row.id;
}

async function ensureSection(subcategoryId: number): Promise<number> {
  const existing = await db.query.classroomSections.findFirst({
    where: and(
      eq(classroomSections.subcategoryId, subcategoryId),
      eq(classroomSections.name, SECTION_NAME),
    ),
  });
  if (existing) return existing.id;

  const [row] = await db
    .insert(classroomSections)
    .values({ name: SECTION_NAME, subcategoryId, sortOrder: 0 })
    .returning();
  console.log(`[seed] Created section "${SECTION_NAME}" (id: ${row.id})`);
  return row.id;
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

  return { noteId, slug, action: existing ? "updated" : "created" as const };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "[seed] DATABASE_URL is not set (checked process.env and .env.local). " +
        "Set it and re-run — see .env.local's Database section.",
    );
    process.exit(1);
  }

  console.log(`[seed] Seeding ${ALL_PAGES.length} pages under "${SUBCATEGORY_NAME}" > "${SECTION_NAME}"...`);

  const subcategoryId = await ensureSubcategory();
  const sectionId = await ensureSection(subcategoryId);

  let created = 0;
  let updated = 0;
  for (const page of ALL_PAGES) {
    const result = await upsertPage(page, subcategoryId, sectionId);
    if (result.action === "created") created += 1;
    else updated += 1;
    console.log(`[seed]   ${result.action === "created" ? "+" : "~"} /classroom/${result.slug}`);
  }

  console.log(
    `[seed] Done. ${created} page(s) created, ${updated} page(s) updated. ` +
      `View at /classroom (subcategory "${SUBCATEGORY_NAME}").`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] Failed:", err);
    process.exit(1);
  });
