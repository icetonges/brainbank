// One-off cleanup for the removed "Knowledge" capture feature (the old
// +Knowledge nav button / /new page / URL-and-file ingestion pipeline).
// Deletes every existing note created that way. Run once from the repo
// root with:
//
//   node --env-file=.env.local scripts/remove-knowledge-notes.mjs
//
// Safe to delete this file afterward — it's not referenced by the app.
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// "Knowledge" notes: created via the removed /new capture flow (manual
// text, URL/YouTube fetch, or file upload). Deliberately excludes
// "obsidian" (separate, kept feature) and "diary" (own private feature).
const KNOWLEDGE_SOURCE_TYPES = ["manual", "url", "youtube", "pdf", "docx", "xlsx", "image", "video"];

const before = await sql`
  select source_type, count(*)::int as n
  from notes
  where category is null
    and source_type::text = any(${KNOWLEDGE_SOURCE_TYPES})
  group by source_type
  order by source_type
`;

console.log("Rows matching deletion criteria, by source_type:");
for (const row of before) console.log(`  ${row.source_type}: ${row.n}`);

const totalBefore = (await sql`select count(*)::int as n from notes`)[0].n;

const deleted = await sql`
  delete from notes
  where category is null
    and source_type::text = any(${KNOWLEDGE_SOURCE_TYPES})
  returning id, slug, title, source_type
`;

console.log(`\nDeleted ${deleted.length} note(s):`);
for (const row of deleted) {
  console.log(`  #${row.id} [${row.source_type}] ${row.slug} — ${row.title}`);
}

const totalAfter = (await sql`select count(*)::int as n from notes`)[0].n;
console.log(`\nnotes table row count: ${totalBefore} -> ${totalAfter}`);
