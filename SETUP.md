# Local setup

Phase 1 is scaffolded: Next.js app, database schema, single-owner auth, and
the dark/light theme shell. Nothing external is wired up yet except what's
below — everything else (uploads, ingestion pipeline, AI tasks, graph data)
comes in later phases per `PLAN.md`.

## 1. Install

```
npm install
```

## 2. Database (Neon — free tier)

1. Create a project at https://neon.tech
2. Copy the pooled connection string into `.env.local` as `DATABASE_URL`
   (copy `.env.example` to `.env.local` first)
3. Run the migration:
   ```
   npm run db:migrate
   ```
   (or `npm run db:push` for quick iteration without a migration file)

## 3. Auth (no external service — single owner account)

```
cp .env.example .env.local
npx auth secret            # writes NEXTAUTH_SECRET into .env.local
node -e "console.log(require('bcryptjs').hashSync('your-password', 10))"
```

Put the printed hash into `OWNER_PASSWORD_HASH`, and your email into
`OWNER_EMAIL`. That's the only account the app has.

## 4. Run it

```
npm run dev
```

Visit http://localhost:3000. Without `DATABASE_URL` set, the homepage still
renders with a "database not connected yet" notice instead of crashing.

## 5. Deploy (Vercel)

1. `vercel link` (or import the GitHub repo in the Vercel dashboard)
2. Add every variable from `.env.example` to the Vercel project's
   Environment Variables
3. Push to `main` — Vercel deploys automatically

## Not wired up yet (future phases, see PLAN.md)

- Cloudflare R2 / Cloudinary uploads
- URL / YouTube / PDF / docx / xlsx ingestion pipeline
- Inngest background jobs
- AI task registry (summarize/tag/translate/link-suggest)
- Interactive graph (currently a placeholder page)
- Obsidian one-way sync
