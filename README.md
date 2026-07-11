# brainbank

A daily knowledge base: capture text, links, videos and documents; each
becomes a connected page structured as **what → how → why**. See
[`PLAN.md`](./PLAN.md) for the full architecture and requirements plan, and
[`SETUP.md`](./SETUP.md) to run this locally.

**Status:** All 8 phases from [`PLAN.md`](./PLAN.md) are in place — app
scaffold, database schema, single-owner auth, the dark/light theme shell, a
provider-agnostic AI chain (AI Assist, translate, summarize, tag
suggestions), an interactive Obsidian-style [[wikilink]] graph,
direct-to-R2/Cloudinary file uploads, a background ingestion pipeline
(paste a URL/YouTube link or upload a PDF/docx/xlsx and get a drafted
what/how/why/other page back, via Inngest), note editing,
draft/published/private status control, note deletion, public-read/
private-edit visibility gating, a custom black/gold favicon, search, and
one-way Obsidian vault sync (`/obsidian` — pulls a `notes/` folder from a
GitHub repo, code-first with an AI drafting fallback for freeform notes).

## Stack

Next.js (App Router) · Neon Postgres + Drizzle ORM · NextAuth (single owner
account) · Tailwind CSS v4 · Vercel AI SDK (Google / Groq / Anthropic) ·
Cloudflare R2 