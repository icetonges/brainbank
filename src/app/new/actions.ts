"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notes, noteContent } from "@/lib/db/schema";
import { slugify } from "@/lib/slug";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { linkWikilinksFromText } from "@/lib/notes/link-wikilinks";
import { detectPrimaryLanguage } from "@/lib/intake";
import { translateNote } from "@/lib/ai/tasks";

export async function createNote(formData: FormData) {
  const session = await auth();
  if (!session) throw new Error("Not signed in");

  const title = String(formData.get("title") ?? "").trim();
  const what = String(formData.get("what") ?? "").trim();
  const how = String(formData.get("how") ?? "").trim();
  const why = String(formData.get("why") ?? "").trim();
  const other = String(formData.get("other") ?? "").trim();

  if (!title) throw new Error("Title is required");

  const primaryLanguage = detectPrimaryLanguage([title, what, how, why, other].join("\n"));
  const original = { title, what, how, why, other };
  const english = primaryLanguage === "zh" ? await translateNote(original, "en") : original;

  const baseSlug = slugify(english.title);
  let slug = baseSlug;
  let suffix = 1;
  // avoid slug collisions
  while (await db.query.notes.findFirst({ where: eq(notes.slug, slug) })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const [note] = await db
    .insert(notes)
    .values({
      slug,
      title: english.title,
      status: "published",
      sourceType: "manual",
      primar