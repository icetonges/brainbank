// Bulk audiobook generation for classroom articles — run by hand on your
// own machine, NOT by anything inside the deployed app. Two reasons this
// is a local script instead of just clicking "Generate audiobook" on
// each article in prod:
//
//   1. agent-server's TTS (qwen3-tts, via lib/ai/media.ts's
//      synthesizeSpeech — this script MUST go through that, never
//      browser/client-side TTS) is reached over your own LAN/Tailscale
//      when run here, instead of a Vercel function relaying through the
//      Funnel — faster, and not bounded by Vercel's maxDuration, which
//      matters once an article has 20-40+ paragraphs each needing their
//      own sequential TTS call (see lib/ai/audiobook.ts's comment on why
//      generation is per-block now).
//   2. Doing 10 articles by hand through the UI is 10 separate page
//      loads and button clicks; this does them in one run with a shared
//      voice and per-article error handling that doesn't abort the rest
//      of the batch if one article fails.
//
// Usage:
//   npx tsx scripts/generate-audiobooks.ts [--voice=<id>] [--limit=10] [--dry-run]
//   npx tsx scripts/generate-audiobooks.ts --slug=<article-slug> [--voice=<id>]
//
// --slug targets exactly one article by its notes.slug (ignores --limit
// and the oldest-first ordering) — for stress-testing one specific known-
// hard article (mixed English/Chinese, lots of inline code, whatever)
// instead of whatever happens to be oldest. Errors out immediately if no
// zh content matches, rather than silently falling through to the
// --limit behavior — a --slug typo should be loud, not quietly process
// the wrong article.
//
// Loads .env.local/.env itself (via @next/env, the same loader `next dev`
// uses internally — it's already a direct dependency of this project) so
// this works from a plain PowerShell/terminal session with nothing
// exported by hand first. That load MUST finish before src/lib/db (which
// reads DATABASE_URL at module-import time, not lazily) is ever imported
// — which is why every project-internal import below is a dynamic
// `await import(...)` inside main() instead of a static top-level import:
// static imports are hoisted and evaluated before ANY of this file's own
// top-level statements run (including the loadEnvConfig() call), so a
// static `import { db } from "../src/lib/db"` at the top of this file
// would read process.env.DATABASE_URL before loadEnvConfig() ever got a
// chance to populate it — silently falling back to db/index.ts's fake
// placeholder host and failing with an opaque "fetch failed" (this is
// exactly what happened on the first run of this script, before this
// comment/fix existed).
//
// Needs DATABASE_URL, LOCAL_LLM_FUNNEL_URL, LOCAL_LLM_SHARED_SECRET, R2_*
// in .env.local (same vars the app itself uses — see .env.example).
// --voice falls back to TTS_DEFAULT_VOICE if not given; if NEITHER is
// set, agent-server's own default voice choice applies to every call,
// which may not be the same voice for every paragraph — see
// lib/ai/audiobook.ts's generateArticleAudio comment. Don't pass the
// literal placeholder text "<real-id>" from the example above — that's a
// stand-in for an actual voice id from your mlx-audio deployment, not a
// value to use verbatim.
//
// Selects the first N (default 10, oldest-created-first) classroom
// articles that have a non-empty Chinese (zh) note_content row, and
// generates the zh audiobook for each. Re-run any time — generation is
// idempotent (it just overwrites that article's audioSegments), so
// there's no separate "regenerate" script.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const DEFAULT_LIMIT = 10;

function argValue(flag: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg?.slice(flag.length + 3);
}

async function main() {
  // Dynamic on purpose — see the file header. All of these (and their own
  // internal imports, transitively) only get evaluated now, well after
  // loadEnvConfig() above has already populated process.env.
  const { and, asc, eq, isNotNull, ne } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db");
  const { notes, noteContent } = await import("../src/lib/db/schema");
  const { generateArticleAudio } = await import("../src/lib/ai/audiobook");

  const voice = argValue("voice") || process.env.TTS_DEFAULT_VOICE || undefined;
  const limit = Number(argValue("limit") ?? DEFAULT_LIMIT);
  const dryRun = process.argv.includes("--dry-run");
  const slug = argValue("slug");

  // Catches ANY angle-bracket placeholder text getting pasted in literally
  // (e.g. "<real-id>", "<a real voice id>") rather than one exact string —
  // this has now happened twice with different wording, and a real voice
  // id would never legitimately contain "<"/">". PowerShell also doesn't
  // treat an unquoted "<...>" as one argument, so a multi-word placeholder
  // silently gets truncated to whatever's between "--voice=" and the
  // first space (e.g. "<a") instead of erroring on its own — this check
  // is what actually catches it.
  if (voice?.includes("<") || voice?.includes(">")) {
    console.error(
      `✗ --voice="${voice}" looks like a placeholder, not a real voice id (a real one won't contain "<" or ">"). ` +
        "Either omit --voice entirely or pass an actual id from your mlx-audio deployment.",
    );
    process.exitCode = 1;
    return;
  }

  if (!voice) {
    console.warn(
      "⚠ No --voice=<id> given and TTS_DEFAULT_VOICE is unset. Every " +
        "article below will use whatever voice agent-server defaults to " +
        "when none is specified — if that's not a single stable voice, " +
        "narration can sound inconsistent within (and across) articles. " +
        "Pass --voice=<id> once you know a real one from your mlx-audio " +
        "deployment.\n",
    );
  }

  const baseWhere = and(isNotNull(notes.category), ne(noteContent.bodyMarkdown, ""));
  const query = db
    .select({
      id: notes.id,
      slug: notes.slug,
      title: notes.title,
      zhTitle: noteContent.title,
      createdAt: notes.createdAt,
    })
    .from(notes)
    .innerJoin(
      noteContent,
      and(eq(noteContent.noteId, notes.id), eq(noteContent.language, "zh")),
    );

  const rows = slug
    ? await query.where(and(baseWhere, eq(notes.slug, slug))).limit(1)
    : await query.where(baseWhere).orderBy(asc(notes.createdAt)).limit(limit);

  if (slug && rows.length === 0) {
    console.error(`✗ No classroom article with slug "${slug}" (and non-empty zh content) found.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Found ${rows.length} Chinese classroom article(s) to process${voice ? ` (voice: ${voice})` : ""}.\n`);

  if (rows.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (dryRun) {
    for (const r of rows) console.log(`  [dry-run] ${r.slug} — ${r.zhTitle || r.title}`);
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const r of rows) {
    const label = r.zhTitle || r.title;
    process.stdout.write(`→ ${r.slug} ("${label}")... `);
    try {
      const { segments, totalBytes } = await generateArticleAudio(r.id, "zh", voice);
      console.log(`done — ${segments.length} segment(s), ${(totalBytes / 1024).toFixed(0)} KB`);
      ok++;
    } catch (err) {
      console.log(`FAILED — ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\n${ok} succeeded, ${failed} failed, out of ${rows.length}.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
