# brainbank

A daily knowledge base: capture text, links, videos and documents; each
becomes a connected page structured as **what → how → why**. See
[`PLAN.md`](./PLAN.md) for the full architecture and requirements plan, and
[`SETUP.md`](./SETUP.md) to run this locally.

**Status:** Phase 1 — app scaffold, database schema, single-owner auth, and
the dark/light theme shell are in place. Uploads, the auto-ingestion
pipeline, AI tasks, and the interactive graph come in later phases.

## Stack

Next.js (App Router) · Neon Postgres + Drizzle ORM · NextAuth (single owner
account) · Tailwind CSS v4 · deployed on Vercel.

## Quick start

```
npm install
cp .env.example .env.local   # fill in DATABASE_URL, NEXTAUTH_SECRET, OWNER_*
npm run db:migrate
npm run dev
```

Full instructions: [`SETUP.md`](./SETUP.md).
