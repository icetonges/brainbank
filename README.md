# brainbank

A daily knowledge base: capture text, links, videos and documents; each
becomes a connected page structured as **what → how → why**. See
[`PLAN.md`](./PLAN.md) for the full architecture and requirements plan, and
[`SETUP.md`](./SETUP.md) to run this locally.

**Status:** Phase 1 + AI layer + graph — app scaffold, database schema,
single-owner auth, the dark/light theme shell, a provider-agnostic AI chain
(AI Assist, translate, summarize, tag suggestions), and an interactive
Obsidian-style [[wikilink]] graph are in place. Uploads and the
auto-ingestion pipeline come in later phases.

## Stack

Next.js (App Router) · Neon Postgres + Drizzle ORM · NextAuth (single owner
account) · Tailwind CSS v4 · Vercel AI SDK (Google / Groq / Anthropic) ·
deployed on Vercel.

## Quick start

```
npm install
cp .env.example .env.local   # fill in DATABASE_URL, NEXTAUTH_SECRET, OWNER_*
npm run db:migrate
npm run dev
```

Full instructions: [`SETUP.md`](./SETUP.md).
