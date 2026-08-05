// Seeds the "DeepLearningAI" classroom subcategory with an "Agentic AI"
// section of 40 bilingual (EN + ZH) knowledge-base pages: Study Plan, then
// 1.1-5.7, then Glossary, then Capstone — a byte-for-byte copy (English
// side) of the 40 files in the user's Agentic_AI_Technical_Study_Guide/
// folder, plus a full Chinese translation of each. See
// src/lib/seed-data/deeplearningai-agentic-ai/all-pages.ts for how the
// data was generated.
//
// Why a standalone script instead of going through the composer UI
// (src/app/classroom/actions.ts's publishClassroomArticle): that action
// also runs the AI publish assist (a call to the app's local LLM) to
// generate the topic/tags/learning-guide/translation — fine for one
// article at a time, but neither necessary nor practical for 48 at once,
// and this app's local model handles one request at a time (see the
// sequential-dispatch comments in actions.ts). This script writes the
// same rows actions.ts would have (notes, note_content en+zh,
// learning_guides, tags/note_tags) directly, with the guide content
// hand-authored in scripts/seed-data/ instead of AI-generated.
//
// Idempotent: re-running updates existing rows (matched by slug) instead
// of creating duplicates, so it's safe to fix a typo in the seed data and
// re-run.
//
// Run locally with:
//   npx tsx scripts/seed-deeplearningai-agentic-ai.ts
// Needs DATABASE_URL — auto-loaded from .env.local if not already set in
// the environment (same var the app itself uses; see .env.local).
//
// Uses relative imports (not the app's "@/..." aliases), same reasoning
// as fetch-trends.ts: this runs standalone via tsx, outside Next.js's
// module resolution.

import fs from "node:fs";
import path from "node:path";

// --- Minimal .env.local loader (no new dependency) ---------------------
// Next.js auto-loads .env.local for `next dev`/`next build`, but a
// standalone tsx script doesn't get that for free. If DATABASE_URL isn't
// already in the environment (e.g. exported in the shell, or this is
// running in CI with secrets injected directly), read it out of
// .env.local ourselves — good enough for KEY=VALUE lines, ignores
// comments/blank lines, never overwrites a var that's already set.
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
// Canonical copy now lives under src/lib so the Next.js admin route
// (src/app/api/admin/seed-deeplearningai-agentic-ai/route.ts) can import it
// via the "@/..." alias too — see that route's header comment for why it
// exists alongside this script. The original scripts/seed-data/ copy this
// script used to import is left in place (unused) rather than deleted.
import { ALL_PAGES, type SeedPage } from "../src/lib/seed-data/deeplearningai-agentic-ai";

const SUBCATEGORY_NAME = "DeepLearningAI";
const SECTION_NAME = "Agentic AI";

function pageSlug(page: SeedPage): string {
  // Deterministic across runs (order + key never change once a page is
  // published) so re-running this script updates the same rows instead
  // of creating duplicates. Already ASCII/hyphen-safe by construction —
  // see the "key" field comment in seed-data/types.ts.
  return `dlai-agentic-ai-${String(page.order).padStart(2, "0")}-${page.key}`;
}

async function ensureSubcategory(): Promise<number> {
  const existing = await db.query.classroomSubcategories.findFirst({
    where: eq(classroomSubcategories.name, SUBCATEGORY_NAME),
  });
  if (existing) return existing.id;

  let slug = subcategorySlug(SUBCATEGORY_NAME);
  if (RESERVED_TOP_LEVEL_SLUGS.has(slug)) slug = `${slug}1`;
  // Collision-safe against another subcategory's slug too, same pattern
  // as uniqueSubcategorySlug() in src/app/classroom/actions.ts.
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
  // titleEn already carries the study guide's own numbering (e.g. "1.1
  // Course Overview", or a plain title for Study Plan/Glossary/Capstone) —
  // don't add another "NN - " prefix on top of it.
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
  // The zh row is stored the same way translateClassroomArticleAction
  // would store a translation (schema.ts's note_content.title is only
  // set on the non-primary-language row) — but translatedAt/translatedModel
  // are deliberately left unset, since this is hand-authored bilingual
  // content, not machine-translated by the article page's Translate
  // button. That keeps the article page from showing a "Translated by
  // <model>" badge that would misdescribe how this text was produced.
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
