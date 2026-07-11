# brainbank — Requirements & Architecture Plan

Status: **planning only, nothing built yet**
Repo: https://github.com/icetonges/brainbank (currently empty, README only)
Vercel project: https://vercel.com/icetonges-projects/brainbank

Decisions confirmed with you before drafting this:
- Access model: **public read** for published notes, **private login** for you to create/edit/upload.
- Storage/DB stack: **Neon Postgres + Cloudflare R2 + Cloudinary**.
- Background jobs: **yes**, add a job runner (Inngest) for slow ingestion/AI work.
- Local LLM: **longer-term** — design the AI layer to be swappable now, don't build tunnel/self-host plumbing yet.

---

## 1. What this app actually is

A personal knowledge base that:
1. You feed with text, URLs, YouTube links, PDFs, docx, xlsx, images, video — via paste or upload.
2. Auto-builds a titled, tagged, image-rich page from that input, using code first and AI only where code can't do the job (summarizing, tagging, translating, relating).
3. Renders every page and their relationships as an interactive, Obsidian-style link graph, updated instantly (no rebuild step).
4. Lets you flip any page between English and Chinese, and structures learning as layers — **What → How → Why → Other**.
5. Is publicly browsable, privately editable, dark-mode-first (black/gold), and cheap enough to run indefinitely on free tiers.

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend + backend | Next.js (App Router) on Vercel | One codebase, SSR for instant updates, generous free tier, matches your stated preference |
| Database | Neon Postgres (free tier) via Drizzle or Prisma | Stores notes, tags, graph edges, translations, users. `pgvector` extension available for later semantic search |
| Large file storage | Cloudflare R2 (10 GB free, no egress fees, S3-compatible) | PDFs, docx, xlsx, md — anything 50MB+ or non-image |
| Image/video delivery | Cloudinary (free tier ~10GB storage/25 credits) | Responsive image rendering, video embeds, thumbnails, transformations — what it's actually good at |
| Auth | NextAuth (Auth.js) with a single owner account (email/passkey) | Free, no vendor lock-in, gates write access only |
| Background jobs | Inngest (free tier) | Durable multi-step jobs for ingestion pipelines that exceed serverless request time limits |
| AI / LLM | Vercel AI SDK, provider-agnostic task registry | Swap models per task via config, not code changes; ready for a local model later |
| Translation (EN↔ZH) | Pluggable task in the same registry — DeepL API as default, LLM as fallback | Dedicated MT is faster/cheaper/more consistent than LLM for straight translation; LLM chain used for nuance/context tasks |
| Note authoring source format | Markdown + YAML frontmatter (Obsidian-compatible: wikilinks, tags, properties) | Lets you optionally author in Obsidian and sync in, without making Obsidian a runtime dependency |

**Why not Vercel Postgres / Vercel Blob for everything:** Vercel dropped managed Postgres (now points to Neon anyway). Vercel Blob free tier is only 1GB — too small once video/PDF usage grows. Function request bodies on Vercel are capped at 4.5MB, so all uploads must go **browser → storage directly** (signed URLs), never through a Vercel function body.

**Why not Quartz (the standard "Obsidian → website" tool):** Quartz is a static-site generator — it rebuilds a whole site from a vault on each publish. That conflicts with your "instant update" and "self-building pages from a pasted URL" requirements, which need a live database and server-rendered pages, not a rebuild step. Instead, we borrow Quartz's *approach* (graph view, backlinks, wikilinks) and implement it natively in Next.js against Postgres, so a new page appears live the moment it's created — Obsidian becomes an optional authoring client, not the publishing engine.

## 3. Data model (high level)

- **notes** — id, slug, title, status (draft/published/private), source_type (manual / url / youtube / pdf / docx / xlsx / image), source_url, created_at, updated_at, primary_language (en/zh)
- **note_content** — note_id, language (en | zh), body_markdown, what, how, why, other (the learning-layer fields), summary
- **tags** — id, name
- **note_tags** — note_id, tag_id
- **edges** — from_note_id, to_note_id, relationship_type (link, related, source-of, derived-from) — this *is* the graph
- **media** — id, note_id, kind (image/video/pdf/doc/spreadsheet), provider (cloudinary/r2), url, size_bytes, mime_type
- **ingestion_jobs** — id, note_id, status, stage, error, started_at, finished_at (tracks the async pipeline below)
- **users** — just you, for now; schema leaves room for future collaborators

## 4. The note template — learning layers

Every generated or authored page is structured, not just free text:

- **What** — definition / the raw fact or concept
- **How** — the mechanism, process, or hands-on steps to apply it
- **Why** — the reasoning, context, or motivation behind it
- **Other** — sources, open questions, related tools, freeform notes

This structure is what makes "deep understanding, expert hands-on skill" navigable rather than just a pile of notes — the UI can let you jump straight to the "How" across every note tagged, say, `#nextjs`, without reading the rest.

## 5. Auto page-building pipeline (text / URL / file / video in → page out)

1. **Intake** — a "New Knowledge" button accepts pasted text, a pasted URL, or a file upload (direct-to-R2 or direct-to-Cloudinary via signed upload URL, so it bypasses Vercel entirely).
2. **Extraction (code first, per your rule #13):**
   - URL → fetch + Readability-style text/og-image/title extraction (JS)
   - YouTube URL → oEmbed metadata + transcript fetch (JS)
   - PDF → text extraction (pdf-parse)
   - docx → mammoth
   - xlsx → SheetJS
   - Images → stored as-is via Cloudinary, no extraction needed
3. **Job queued in Inngest** (this step is async because parsing a 50MB PDF or fetching a long transcript won't finish inside a normal web request).
4. **AI step (only where code can't do it):**
   - Generate title, tags, and What/How/Why/Other draft from extracted text
   - Suggest links to existing notes (keyword match first; embedding similarity if/when pgvector is added)
   - Translate to the non-primary language and store both versions
5. **Page created** in `published: draft` state — pops up in your inbox for a quick approve/edit, then goes live instantly (no rebuild).

Every AI call in step 4 goes through the task registry (see §6), so any one of them can be swapped for a plain-code version later if it turns out not to need a model.

## 6. AI / LLM chain design (flexible, swap-in-place)

A single config maps **task name → provider + model**, e.g.:

```
summarize:      { provider: "anthropic", model: "claude-sonnet-5" }
tag-and-link:   { provider: "anthropic", model: "claude-haiku-4-5" }
translate:      { provider: "deepl" }            // non-LLM by default
embed:          { provider: "openai", model: "text-embedding-3-small" }
```

Swapping a task to a different model, or later to a local model (via an OpenAI-compatible endpoint you expose, e.g. through Ollama + a tunnel), is a one-line config change — no code changes elsewhere. This directly satisfies your requirement that the chain stay easy to maintain as you add models. Local-model connectivity itself (tunneling your machine to the deployed app) is intentionally deferred, per your answer above.

## 7. Interactive graph

Custom React component (force-directed graph, e.g. `react-force-graph` or D3) rendered client-side, fed by the `edges` table. Clicking a node navigates to that note; hovering previews What/How/Why. Because it reads live from Postgres, new notes and new links appear on the graph immediately — no separate publish step.

## 8. Obsidian's actual role

Obsidian itself never runs on the server — it's a desktop app. Its role here is **optional local authoring**:
- You can write notes in Obsidian using the same markdown + frontmatter schema as the app.
- The Obsidian Git plugin (or a small sync script) pushes your vault to a `notes/` folder in the GitHub repo.
- A webhook/Inngest job imports new/changed files from that folder into Postgres, running them through the same tagging/translation pipeline as any other input.
- This is one-way by default (Obsidian → site); true two-way sync is a stretch goal, not part of this phase.

If this ends up feeling redundant once the web app's own editor is good enough, Obsidian can simply be dropped without affecting the site.

## 9. Design system

- **Dark mode (default):** near-black background, gold accent for links/buttons/active states.
- **Light mode:** toggle in the header, persisted per-visitor.
- **Typography:** Aptos isn't freely licensed for web embedding, so default to a similar humanist sans (Inter or Public Sans) unless you already have an Aptos web-font license to supply. High-contrast foreground text only — no low-contrast gray-on-gray body copy.
- **Language toggle:** EN/ZH button on every page, English default; Chinese input is auto-translated to English on save and both versions are stored, so the toggle is instant (no re-translation on click).
- **Action buttons:** consistent button system per page — Translate, Regenerate, Add Tag, Find Related, Publish/Unpublish, Export to Obsidian, Delete.
- **Favicon:** produced during build phase, not now.

## 10. Requirements traceability

| # | Requirement | Covered by |
|---|---|---|
| 1 | Knowledge management system | §3–4 data model + note template |
| 2 | Daily-use, connect & deepen understanding, AI build skills | Graph (§7) + What/How/Why layers (§4) |
| 3 | Interactive, self-updating | Live DB + SSR, no static rebuild (§2, §7) |
| 4 | Text/URL intake → new page | §5 pipeline |
| 5 | Obsidian-style connection management | §7 graph + §8 optional Obsidian sync |
| 6 | Layers: what/how/why/other | §4 |
| 7 | Large, varied docs (50MB+) | R2 for large files, direct-upload bypassing Vercel's 4.5MB limit (§2) |
| 8 | Upload feature | §5 step 1, signed direct uploads |
| 9 | Visual-rich rendering | Cloudinary (§2) |
| 10 | Auto-build templated pages w/ title, date, topic, tags, graph links | §5 pipeline |
| 11 | EN↔ZH translation | §6, §9 |
| 12 | Rich action buttons | §9 |
| 13 | Code-first, AI only when needed | §5 step 2 vs step 4 split |
| 14 | Swappable LLM chain, local models later | §6 |
| 15 | Favicon, dark mode black/gold + light toggle | §9 |
| 16 | Eye-friendly, high-contrast font | §9 |
| 17 | Per-page EN/ZH toggle | §9 |
| 18 | Auto-translate Chinese input, default English | §5 step 4, §9 |

## 11. Open risks / things worth confirming before building

- **Cloudinary free-tier per-file limits** aren't published precisely for the free plan — worth a quick real test upload before relying on it for anything beyond images/short video.
- **Neon + R2 + Cloudinary + Inngest** is 4 external vendors on top of Vercel — more signup/config overhead than a single-vendor approach, in exchange for meaningfully more free-tier headroom.
- **YouTube transcript fetching** can be blocked/rate-limited by YouTube depending on the library used — may need a fallback (Whisper transcription via AI) for videos without captions.
- **Aptos font licensing** — confirm you have (or don't need) rights to self-host it; otherwise we ship a close open alternative.
- **Two-way Obsidian sync** is explicitly out of scope for phase 1 (one-way Obsidian → site only) to keep the sync logic simple; flag if that's a hard requirement rather than a nice-to-have.

## 12. Suggested build phases (for when you say go)

1. Scaffold Next.js app, Neon schema, auth, dark/light theme shell.
2. Manual note create/edit UI with What/How/Why/Other fields + EN/ZH storage, no AI yet.
3. Direct-to-R2/Cloudinary uploads + media rendering.
4. Graph view over real data.
5. Ingestion pipeline (URL/YouTube/PDF/docx/xlsx) with Inngest, code-only extraction.
6. AI task registry: summarize, tag, link-suggest, translate.
7. Obsidian one-way sync.
8. Polish: favicon, button system, publish/unpublish, search.

---

This is a plan only — say the word and I'll start on Phase 1.
