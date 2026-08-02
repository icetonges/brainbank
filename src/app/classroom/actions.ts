"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  notes,
  noteContent,
  noteTags,
  tags,
  learningGuides,
  classroomSubcategories,
  classroomSections,
} from "@/lib/db/schema";
import type { ClassroomCategory } from "@/lib/db/schema";
import { isClassroomCategory } from "@/lib/classroom";
import { slugify, subcategorySlug, RESERVED_TOP_LEVEL_SLUGS } from "@/lib/slug";
import {
  publishAssist,
  translateText,
  translateTextWithMeta,
  type PublishAssistResult,
} from "@/lib/ai/tasks";
import { MODELS, type ModelId } from "@/lib/ai/models";
import { linkWikilinksFromText } from "@/lib/notes/link-wikilinks";
import { linkRelatedByTags } from "@/lib/notes/link-related";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// NOTE: a maxDuration export was tried here as a backstop (matching the one
// on /api/ai/assist/route.ts) but "use server" files may only export async
// functions — Turbopack fails the whole module (and cascades to every
// importer) if a plain const is exported alongside the actions.
//
// That's not actually where this needs to live, though: a Server Action
// runs as the Vercel Function for the *page* that invoked it, so its
// duration ceiling comes from that page's own route segment config, not
// from this file. Every page that calls into an AI-backed action here
// (classroom/[slug]/page.tsx, classroom/[slug]/edit/page.tsx,
// classroom/new/page.tsx) exports `maxDuration = 500` itself — see the
// comment on classroom/[slug]/page.tsx for the failure mode this fixes
// (translate/regenerate repeatably dying with "An unexpected response was
// received from the server" once a call ran past the account's
// unconfigured default duration).
//
// That page-level export is the officially documented mechanism (Server
// Actions inherit Route Segment Config from their invoking page), but it
// has a long history of NOT actually being honored for Server Actions
// specifically, independent of whether it's honored for the page's own
// render — see vercel/next.js discussions #58855 and #64437: multiple
// people needed a `vercel.json` "functions" glob entry as a second,
// platform-level ceiling before the Server Action's timeout actually
// changed, especially in an `src/app` layout like this one (a bare
// "app/**" glob silently doesn't match). See /vercel.json at the repo
// root — it sets the same maxDuration=500 for src/app/classroom/** and
// src/app/api/ai/** directly at the Vercel config level, so the ceiling
// applies even if Next's page-level inheritance doesn't take effect for a
// given deploy.
//
// 500 requires Fluid Compute enabled on the Vercel project — it exceeds
// the classic 300s serverless ceiling that the original 290 was chosen to
// stay just under. See the maxDuration comment on classroom/[slug]/page.tsx.
//
// The sequential (not Promise.all) AI-call dispatch below still matters
// on its own merits — it avoids queuing calls behind each other against
// the single local model — but it was never sufficient by itself without
// a real ceiling to run in.

async function requireOwner() {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
}

/** The composer/edit form's source-URL field → notes.sourceUrl. Empty
 * stays null; a scheme-less paste like "example.com/post" gets https://
 * prepended (the input is type="text" so such pastes aren't rejected by
 * the browser). Anything that still isn't a parseable http(s) URL is
 * dropped rather than failing the whole publish. */
function normalizeSourceUrl(raw: string): string | null {
  const trimmed = raw.trim().slice(0, 2000);
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function uniqueSlug(base: string, keepNoteId?: number): Promise<string> {
  let slug = base || "untitled";
  let suffix = 1;
  for (;;) {
    const existing = await db.query.notes.findFirst({ where: eq(notes.slug, slug) });
    if (!existing || existing.id === keepNoteId) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

/** A new subcategory's landing-page slug — collision-safe against both
 * existing subcategories and the app's own top-level routes (a subcategory
 * slug matching e.g. "search" or "classroom" would be shadowed by that
 * static route and permanently unreachable). */
async function uniqueSubcategorySlug(base: string): Promise<string> {
  let slug = base;
  let suffix = 1;
  for (;;) {
    if (!RESERVED_TOP_LEVEL_SLUGS.has(slug)) {
      const existing = await db.query.classroomSubcategories.findFirst({
        where: eq(classroomSubcategories.slug, slug),
      });
      if (!existing) return slug;
    }
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

/**
 * Resolves the composer/edit form's subcategory fields to a subcategoryId.
 * `newName` (the "or add a new one" field) wins when both are present —
 * picking an existing option AND typing a new name at the same time means
 * the new name is what the user actually wants filed under. Returns null
 * for "no subcategory", same as leaving it blank.
 */
async function resolveSubcategoryId(
  selectedId: string,
  newName: string,
): Promise<number | null> {
  const trimmedName = newName.trim().slice(0, 120);
  if (trimmedName) {
    let row = await db.query.classroomSubcategories.findFirst({
      where: eq(classroomSubcategories.name, trimmedName),
    });
    if (!row) {
      const slug = await uniqueSubcategorySlug(subcategorySlug(trimmedName));
      [row] = await db
        .insert(classroomSubcategories)
        .values({ name: trimmedName, slug })
        .returning();
    }
    return row.id;
  }
  const id = Number(selectedId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Resolves the composer/edit form's section fields to a sectionId, mirroring
 * resolveSubcategoryId above. A section always belongs to a subcategory —
 * one-to-many, subcategory to sections — so without a resolved
 * subcategoryId any section selection is ignored (nothing to nest it
 * under). Same "new name wins" rule, and uniqueness is scoped to the
 * subcategory (see the (subcategoryId, name) unique index) so the same
 * section name can exist under two different subcategories.
 */
async function resolveSectionId(
  selectedId: string,
  newName: string,
  subcategoryId: number | null,
): Promise<number | null> {
  if (!subcategoryId) return null;
  const trimmedName = newName.trim().slice(0, 120);
  if (trimmedName) {
    let row = await db.query.classroomSections.findFirst({
      where: and(
        eq(classroomSections.subcategoryId, subcategoryId),
        eq(classroomSections.name, trimmedName),
      ),
    });
    if (!row) {
      [row] = await db
        .insert(classroomSections)
        .values({ name: trimmedName, subcategoryId })
        .returning();
    }
    return row.id;
  }
  const id = Number(selectedId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Attach the AI-suggested tags to a note (creating tag rows as needed). */
async function applyTags(noteId: number, suggested: string[]) {
  for (const name of suggested) {
    const normalized = name.trim().toLowerCase();
    if (!normalized) continue;

    let tag = await db.query.tags.findFirst({ where: eq(tags.name, normalized) });
    if (!tag) {
      [tag] = await db.insert(tags).values({ name: normalized }).returning();
    }

    const existingLink = await db.query.noteTags.findFirst({
      where: and(eq(noteTags.noteId, noteId), eq(noteTags.tagId, tag.id)),
    });
    if (!existingLink) {
      await db.insert(noteTags).values({ noteId, tagId: tag.id });
    }
  }
  await linkRelatedByTags(noteId);
}

/** Insert-or-update the AI publish assist's learning guide for a note. */
async function saveGuide(noteId: number, assist: PublishAssistResult) {
  const existing = await db.query.learningGuides.findFirst({
    where: eq(learningGuides.noteId, noteId),
  });
  const values = {
    learningMap: assist.learningMap,
    handsOn: assist.handsOn,
    resources: assist.resources,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(learningGuides).set(values).where(eq(learningGuides.id, existing.id));
  } else {
    await db.insert(learningGuides).values({ noteId, ...values });
  }
}

/**
 * Called by the composer before its first image upload — the signed-upload
 * flow needs a noteId to attach media to, so an empty classroom draft is
 * created lazily the moment the user adds an image (see
 * classroom-composer.tsx). publishClassroomArticle() then fills it in.
 */
export async function createClassroomDraft(): Promise<{ noteId: number; slug: string }> {
  await requireOwner();

  const slug = await uniqueSlug(`classroom-draft-${Date.now()}`);
  const [note] = await db
    .insert(notes)
    .values({
      slug,
      title: "Untitled classroom draft",
      status: "draft",
      sourceType: "manual",
      category: "ai",
      primaryLanguage: "en",
    })
    .returning();

  await db.insert(noteContent).values({ noteId: note.id, language: "en" });
  return { noteId: note.id, slug: note.slug };
}

/**
 * The composer's Save button. Creates (or fills in) the knowledge page,
 * then runs the AI publish assist to generate the topic (if none was
 * typed), the subtab category, tags, summary, learning map, hands-on
 * steps, and top-3 resources. AI failure degrades gracefully: the article
 * is still published and the guide can be regenerated from its page.
 */
export async function publishClassroomArticle(formData: FormData) {
  await requireOwner();

  const draftNoteId = Number(formData.get("noteId") || 0) || undefined;
  const topic = String(formData.get("topic") ?? "").trim();
  const rawCategory = String(formData.get("category") ?? "").trim();
  const rawLanguage = String(formData.get("language") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const sourceUrl = normalizeSourceUrl(String(formData.get("sourceUrl") ?? ""));
  // The composer's model picker (classroom-composer.tsx) — validated
  // against the registry rather than trusted as-is, same defensive pattern
  // as /api/ai/assist/route.ts's modelId check. An unrecognized value
  // (only reachable by hand-crafting the POST — the <select> only ever
  // submits a real MODELS id) falls back to undefined, which publishAssist
  // already treats as "use the task's default."
  const rawModelId = String(formData.get("modelId") ?? "");
  const modelId: ModelId | undefined = MODELS.some((m) => m.id === rawModelId)
    ? (rawModelId as ModelId)
    : undefined;
  // The composer's "Private" checkbox — a private article is stored with
  // status "private" instead of "published" (see schema.ts's noteStatusEnum,
  // and the article/list pages' `note.status !== "published" && !session`
  // gate) so it 404s for anyone not logged in as the owner, same as a
  // draft. Can be flipped later from the article page's lock/unlock button
  // (setArticlePrivacyAction below) or the edit form.
  const isPrivate = formData.get("private") === "on";

  if (body.length < 10) throw new Error("Write at least a few words first");
  if (body.length > 100_000) throw new Error("Content is limited to 100,000 characters");
  if (rawLanguage !== "en" && rawLanguage !== "zh") {
    throw new Error("Pick the article's language");
  }

  const subcategoryId = await resolveSubcategoryId(
    String(formData.get("subcategoryId") ?? ""),
    String(formData.get("newSubcategory") ?? ""),
  );
  const sectionId = await resolveSectionId(
    String(formData.get("sectionId") ?? ""),
    String(formData.get("newSection") ?? ""),
    subcategoryId,
  );

  const category: ClassroomCategory | undefined = isClassroomCategory(rawCategory)
    ? rawCategory
    : undefined;

  // One AI pass over the raw content: publishAssist generates everything
  // the article *page* needs around the content (topic when left blank,
  // subtab, tags, summary, learning guide, resources) — it never touches
  // the content itself. The main box is exactly what was typed/pasted
  // (or extracted from a URL/file client-side, which is plain code, not
  // AI — see extract-actions.ts) and is stored byte-for-byte as finalBody
  // below. This used to also run formatArticleContent to rewrite the body
  // into a "polished" structure, but that meant the model was silently
  // paraphrasing/altering the owner's actual words and facts (most
  // visible on Chinese input) — removed outright rather than degraded,
  // since there's no "mostly faithful rewrite" middle ground worth
  // keeping for a step whose entire job was rewriting.
  const assistResult: PromiseSettledResult<PublishAssistResult> = await publishAssist(
    { topic, category, content: body },
    modelId,
  )
    .then((value) => ({ status: "fulfilled" as const, value }))
    .catch((reason) => ({ status: "rejected" as const, reason }));
  const assist: PublishAssistResult | null =
    assistResult.status === "fulfilled" ? assistResult.value : null;
  if (assistResult.status === "rejected") {
    console.error("publishAssist failed, publishing without a guide:", assistResult.reason);
  }
  const finalBody = body;

  // A typed topic is authoritative, same rule as the diary's title — AI
  // only names the article when the author left the field blank.
  const finalTopic =
    (topic || assist?.topic || body.split(/\r?\n/).find(Boolean)?.slice(0, 80) || "Untitled").slice(0, 500);
  const finalCategory: ClassroomCategory = assist?.category ?? category ?? "ai";
  // The author states the language explicitly (composer's required <select
  // name="language">) rather than it being auto-detected — the article
  // page's Translate button targets whichever language this isn't, so
  // guessing wrong here used to mean the button translated the wrong
  // direction or (when detection landed on the language already being
  // viewed) didn't visibly appear at all.
  const primaryLanguage: "en" | "zh" = rawLanguage;

  const slug = await uniqueSlug(slugify(finalTopic), draftNoteId);

  let noteId: number;
  if (draftNoteId) {
    // Draft was created early for image uploads — fill it in.
    await db
      .update(notes)
      .set({
        slug,
        title: finalTopic,
        status: isPrivate ? "private" : "published",
        category: finalCategory,
        subcategoryId,
        sectionId,
        primaryLanguage,
        sourceUrl,
        updatedAt: new Date(),
      })
      .where(eq(notes.id, draftNoteId));
    noteId = draftNoteId;

    // Store the body under its detected language so the EN/中文 toggle and
    // the translate button treat it correctly (a Chinese article lives in
    // the zh row, its English translation in the en row, and vice versa).
    const content = await db.query.noteContent.findFirst({
      where: and(eq(noteContent.noteId, noteId), eq(noteContent.language, primaryLanguage)),
    });
    if (content) {
      await db
        .update(noteContent)
        .set({ bodyMarkdown: finalBody, summary: assist?.summary ?? "" })
        .where(eq(noteContent.id, content.id));
    } else {
      await db.insert(noteContent).values({
        noteId,
        language: primaryLanguage,
        bodyMarkdown: finalBody,
        summary: assist?.summary ?? "",
      });
    }
  } else {
    const [note] = await db
      .insert(notes)
      .values({
        slug,
        title: finalTopic,
        status: isPrivate ? "private" : "published",
        sourceType: "manual",
        category: finalCategory,
        subcategoryId,
        sectionId,
        primaryLanguage,
        sourceUrl,
      })
      .returning();
    noteId = note.id;

    await db.insert(noteContent).values({
      noteId,
      language: primaryLanguage,
      bodyMarkdown: finalBody,
      summary: assist?.summary ?? "",
    });
  }

  if (assist) {
    await saveGuide(noteId, assist);
    await applyTags(noteId, [...assist.tags, finalCategory]);
  }

  // [[Wikilinks]] in the published body become graph edges, same as
  // regular notes. Use the formatted body — it's what's actually stored,
  // and the formatter preserves [[wikilinks]] like any other content.
  await linkWikilinksFromText(noteId, finalBody);

  // Chinese articles get an English translation immediately rather than
  // waiting for someone to click the Translate button — the homepage and
  // /classroom listing default to English and need an English title/body
  // on hand to show without a manual step first.
  if (primaryLanguage === "zh") {
    try {
      await translateClassroomArticleAction(noteId, slug, "en");
    } catch (err) {
      console.error("Auto-translate to English failed:", err);
    }
  }

  revalidatePath("/classroom");
  redirect(`/classroom/${slug}`);
}

/** Re-run the AI publish assist for an existing article (e.g. after the
 * first attempt failed, or after a big edit). Keeps the user's topic. */
export async function regenerateGuideAction(noteId: number, slug: string) {
  await requireOwner();

  const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
  // The original body lives in the primary-language row (see
  // publishClassroomArticle); fall back to whichever row has content.
  let content = note
    ? await db.query.noteContent.findFirst({
        where: and(eq(noteContent.noteId, noteId), eq(noteContent.language, note.primaryLanguage)),
      })
    : undefined;
  if (!content?.bodyMarkdown) {
    const rows = await db.query.noteContent.findMany({ where: eq(noteContent.noteId, noteId) });
    content = rows.find((r) => r.bodyMarkdown);
  }
  if (!note || !content?.bodyMarkdown) throw new Error("Nothing to build a guide from");

  // Unlike publishClassroomArticle/updateClassroomArticle (which run
  // publishAssist as one optional pass alongside a publish/save that
  // already has other important side effects to complete), this action's
  // entire job IS the AI call — but it still shouldn't crash the whole
  // page on an AI failure (agent-server unreachable, an expired/rotated
  // LOCAL_LLM_SHARED_SECRET returning 401, a timeout, etc.). An uncaught
  // throw here previously propagated straight to the root error.tsx
  // boundary and replaced the entire article page with a bare
  // "Something went wrong" + digest — accurate in the server logs but
  // unhelpful on screen, and needlessly destructive for what's just a
  // "regenerate" action the user can retry. Catch and re-throw a message
  // that's actually informative in that boundary instead.
  let assist: PublishAssistResult;
  try {
    assist = await publishAssist({
      topic: note.title,
      category: note.category ?? undefined,
      content: content.bodyMarkdown,
    });
  } catch (err) {
    console.error("regenerateGuideAction: publishAssist failed:", err);
    throw new Error(
      "Couldn't regenerate the guide — the local AI model didn't respond. Check /llm's status card, then try again.",
    );
  }

  await saveGuide(noteId, assist);
  await applyTags(noteId, assist.tags);
  await db
    .update(noteContent)
    .set({ summary: assist.summary })
    .where(eq(noteContent.id, content.id));
  if (!note.category) {
    await db.update(notes).set({ category: assist.category }).where(eq(notes.id, noteId));
  }

  revalidatePath(`/classroom/${slug}`);
}

/** The edit page's Save button — updates topic, category, and body; slug is
 * kept stable so existing links keep working. Optionally re-runs the AI
 * publish assist over the new content. */
export async function updateClassroomArticle(
  noteId: number,
  slug: string,
  formData: FormData,
) {
  await requireOwner();

  const topic = String(formData.get("topic") ?? "").trim();
  const rawCategory = String(formData.get("category") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const sourceUrl = normalizeSourceUrl(String(formData.get("sourceUrl") ?? ""));
  const regenerate = formData.get("regenerate") === "on";
  // Same private/public checkbox as the composer (see publishClassroomArticle
  // above) — the edit page only ever loads an already-published-or-private
  // article (never a mid-upload "draft"), so unconditionally setting status
  // from this checkbox on every save is safe: there's no third state here
  // that could be clobbered.
  const isPrivate = formData.get("private") === "on";

  if (!topic) throw new Error("Topic is required");
  if (!isClassroomCategory(rawCategory)) throw new Error("Pick a category");

  const subcategoryId = await resolveSubcategoryId(
    String(formData.get("subcategoryId") ?? ""),
    String(formData.get("newSubcategory") ?? ""),
  );
  const sectionId = await resolveSectionId(
    String(formData.get("sectionId") ?? ""),
    String(formData.get("newSection") ?? ""),
    subcategoryId,
  );

  const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
  if (!note) throw new Error("Article not found");

  await db
    .update(notes)
    .set({
      title: topic.slice(0, 500),
      status: isPrivate ? "private" : "published",
      category: rawCategory,
      subcategoryId,
      sectionId,
      sourceUrl,
      updatedAt: new Date(),
    })
    .where(eq(notes.id, noteId));

  // Edits land in the original (primary-language) row; a stale translation
  // in the other row can be refreshed with the article page's translate button.
  const content = await db.query.noteContent.findFirst({
    where: and(eq(noteContent.noteId, noteId), eq(noteContent.language, note.primaryLanguage)),
  });
  if (content) {
    await db.update(noteContent).set({ bodyMarkdown: body }).where(eq(noteContent.id, content.id));
  } else {
    await db.insert(noteContent).values({ noteId, language: note.primaryLanguage, bodyMarkdown: body });
  }

  await linkWikilinksFromText(noteId, body);

  if (regenerate) {
    try {
      const assist = await publishAssist({ topic, category: rawCategory, content: body });
      await saveGuide(noteId, assist);
      await applyTags(noteId, assist.tags);
      if (content) {
        await db
          .update(noteContent)
          .set({ summary: assist.summary })
          .where(eq(noteContent.id, content.id));
      }
    } catch (err) {
      console.error("publishAssist regenerate failed:", err);
    }
  }

  revalidatePath(`/classroom/${slug}`);
  revalidatePath("/classroom");
  redirect(`/classroom/${slug}`);
}

/**
 * The article page's EN/中文 translate button. Translates the body and
 * summary into the target language (stored as that language's note_content
 * row) and, when the target is Chinese, also renders the learning guide's
 * map and hands-on steps into the zh columns. English guides are the base
 * columns; if the article was originally Chinese, translating to English
 * moves the Chinese guide into the zh columns and puts English in the base.
 */
export async function translateClassroomArticleAction(
  noteId: number,
  slug: string,
  target: "en" | "zh",
) {
  await requireOwner();

  const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
  if (!note) throw new Error("Article not found");

  const source = target === "zh" ? "en" : "zh";
  let sourceContent = await db.query.noteContent.findFirst({
    where: and(eq(noteContent.noteId, noteId), eq(noteContent.language, source)),
  });
  if (!sourceContent?.bodyMarkdown) {
    const rows = await db.query.noteContent.findMany({ where: eq(noteContent.noteId, noteId) });
    sourceContent = rows.find((r) => r.bodyMarkdown && r.language !== target);
  }
  if (!sourceContent?.bodyMarkdown) throw new Error("Nothing to translate yet");

  // note.title is always the *original* language's title (see
  // publishClassroomArticle) — translate it alongside the body so the
  // heading isn't left in the wrong language when viewing a translation.
  // The body uses translateTextWithMeta so the article page can show which
  // model(s) actually did the work (usually one; more than one means the
  // fallback chain kicked in partway through).
  //
  // Sequential, not Promise.all — this app has exactly one model
  // registered (local/default, a single self-hosted Ollama instance that
  // generates one response at a time), so firing body+summary+title
  // concurrently doesn't speed anything up, it just makes agent-server
  // queue two of the three behind the first while each one's own
  // per-call abortSignal timeout (tasks.ts) keeps counting from dispatch
  // time rather than from when it actually starts. That's the concrete
  // difference from the /llm chatbox (a single request, never contends
  // with itself) and the likely reason translation was failing/timing out
  // even when a single chat message went through fine.
  //
  // --- Transactional commit ---
  // Every piece below is translated (and, inside translateText /
  // translateTextWithMeta, validated — see tasks.ts's
  // detectTranslationProblem/TranslationQualityError) BEFORE any database
  // write happens. If body/summary/title fails validation on every model
  // in the fallback chain, the catch below rethrows and NOTHING is
  // written — the existing content stays exactly as it was, and the
  // owner sees a clear, specific error (surfaced by the classroom route's
  // error.tsx) instead of a silently corrupted translation landing on the
  // page. This app's Neon connection uses the neon-http driver, which has
  // no real multi-statement SQL transaction support, so "transactional"
  // here means "translate-and-validate everything first, commit after" —
  // not a literal BEGIN/COMMIT — but it gets the guarantee that actually
  // matters: a bad translation is never observable, only ever a clean
  // failure.
  let bodyResult!: Awaited<ReturnType<typeof translateTextWithMeta>>;
  let summary = "";
  let title = "";
  try {
    bodyResult = await translateTextWithMeta(sourceContent.bodyMarkdown, target);
    summary = await translateText(sourceContent.summary ?? "", target);
    title = note.primaryLanguage === target ? "" : await translateText(note.title, target);
  } catch (err) {
    console.error(
      `[translate] article ${noteId} (${slug}) -> ${target} failed before any write`,
      err,
    );
    throw new Error(
      `Translation didn't pass validation after trying every available model. Nothing was saved — the existing content is unchanged. (${
        err instanceof Error ? err.message : "unknown error"
      })`,
    );
  }
  const body = bodyResult.text;
  const translatedModel = bodyResult.models.join(",") || null;
  const translatedAt = new Date();

  // Translate the learning guide too — same translate-then-commit order,
  // but its failure doesn't take down the article translation above: the
  // body/summary/title already passed validation, and regenerateGuideAction
  // lets the owner retry just the guide independently later, so throwing
  // away a good article translation over an unrelated guide failure would
  // be strictly worse than leaving the guide's existing translation as-is.
  const guide = await db.query.learningGuides.findFirst({
    where: eq(learningGuides.noteId, noteId),
  });
  let guideTranslation: { mapText: string; handsOnText: string } | null = null;
  if (guide && (guide.learningMap || guide.handsOn)) {
    try {
      // Sequential here too, same single-local-model reasoning as above.
      if (target === "zh") {
        guideTranslation = {
          mapText: guide.learningMap ? await translateText(guide.learningMap, "zh") : "",
          handsOnText: guide.handsOn ? await translateText(guide.handsOn, "zh") : "",
        };
      } else if (note.primaryLanguage === "zh") {
        guideTranslation = {
          mapText: guide.learningMap ? await translateText(guide.learningMap, "en") : "",
          handsOnText: guide.handsOn ? await translateText(guide.handsOn, "en") : "",
        };
      }
    } catch (err) {
      console.error(
        `[translate] article ${noteId} (${slug}) guide -> ${target} failed validation, keeping existing guide translation`,
        err,
      );
      guideTranslation = null;
    }
  }

  const existing = await db.query.noteContent.findFirst({
    where: and(eq(noteContent.noteId, noteId), eq(noteContent.language, target)),
  });
  if (existing) {
    await db
      .update(noteContent)
      .set({ bodyMarkdown: body, summary, title, translatedAt, translatedModel })
      .where(eq(noteContent.id, existing.id));
  } else {
    await db.insert(noteContent).values({
      noteId,
      language: target,
      bodyMarkdown: body,
      summary,
      title,
      translatedAt,
      translatedModel,
    });
  }

  if (guideTranslation && guide) {
    if (target === "zh") {
      await db
        .update(learningGuides)
        .set({
          learningMapZh: guideTranslation.mapText,
          handsOnZh: guideTranslation.handsOnText,
          updatedAt: new Date(),
        })
        .where(eq(learningGuides.id, guide.id));
    } else if (note.primaryLanguage === "zh") {
      // Base guide is Chinese: preserve it in the zh columns, put the new
      // English rendition in the base columns.
      await db
        .update(learningGuides)
        .set({
          learningMap: guideTranslation.mapText,
          handsOn: guideTranslation.handsOnText,
          learningMapZh: guide.learningMapZh || guide.learningMap,
          handsOnZh: guide.handsOnZh || guide.handsOn,
          updatedAt: new Date(),
        })
        .where(eq(learningGuides.id, guide.id));
    }
  }

  revalidatePath(`/classroom/${slug}`);
}

export async function deleteClassroomArticle(noteId: number) {
  await requireOwner();
  // note_content, note_tags, media, edges, and learning_guides all
  // cascade-delete via FK constraints — see schema.ts.
  await db.delete(notes).where(eq(notes.id, noteId));
  revalidatePath("/classroom");
  redirect("/classroom");
}

/**
 * The article page's lock/unlock button (PrivacyToggleButton) — flips an
 * article between "published" (visible to anyone) and "private" (visible
 * only to the logged-in owner; see the `note.status !== "published" &&
 * !session` gate on the article/list/side-nav pages). Double mode, not a
 * one-way "make private" — calling this again with makePrivate=false
 * un-locks it back to public.
 *
 * Deliberately refuses to touch a "draft" note (an in-progress composer
 * upload that hasn't been published yet — see createClassroomDraft) since
 * that status means something different and unrelated; only an already
 * published-or-private article's visibility is meant to be toggled here.
 */
export async function setArticlePrivacyAction(
  noteId: number,
  slug: string,
  makePrivate: boolean,
) {
  await requireOwner();

  const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
  if (!note) throw new Error("Article not found");
  if (note.status !== "published" && note.status !== "private") {
    throw new Error(`Can't toggle visibility on a note with status "${note.status}"`);
  }

  await db
    .update(notes)
    .set({ status: makePrivate ? "private" : "published", updatedAt: new Date() })
    .where(eq(notes.id, noteId));

  revalidatePath(`/classroom/${slug}`);
  revalidatePath("/classroom");
}

/**
 * The subcategory landing page's drag-to-reorder — owner-only (the UI
 * itself hides the drag handles from anonymous visitors, but the action
 * re-checks since it's a real mutation). `orderedNoteIds` is the section's
 * full article list in its new top-to-bottom order; each note's
 * `sectionOrder` becomes its index, so future queries just `ORDER BY
 * section_order` to get this exact order back. The `eq(notes.sectionId, ...)`
 * guard keeps a stale client from writing an order onto notes that have
 * since moved to a different section.
 */
export async function reorderSectionArticles(
  sectionId: number,
  subcategorySlugValue: string,
  orderedNoteIds: number[],
) {
  await requireOwner();

  await Promise.all(
    orderedNoteIds.map((noteId, index) =>
      db
        .update(notes)
        .set({ sectionOrder: index })
        .where(and(eq(notes.id, noteId), eq(notes.sectionId, sectionId))),
    ),
  );

  revalidatePath(`/${subcategorySlugValue}`);
}
