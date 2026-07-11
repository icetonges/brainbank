# Local setup

Phase 1 is scaffolded: Next.js app, database schema, single-owner auth, and
the dark/light theme shell. The AI layer (model registry, AI Assist,
translate/summarize/tag), the interactive graph, and file uploads
(Cloudflare R2 + Cloudinary) are wired up too — see steps 3 and 3c. The
ingestion pipeline and background jobs come in later phases per `PLAN.md`.

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

## 3b. AI providers (optional, but AI Assist / translate / tag need at least one)

The model picker (`src/lib/ai/models.ts`) lists models from Google, Groq,
and Anthropic. You only need a key for the provider(s) you want to use —
the app works fine with zero AI keys set, those features just show an error
when clicked until a key is added.

- **Google AI Studio** (free, powers the default model): key at
  https://aistudio.google.com/apikey → `GOOGLE_GENERATIVE_AI_API_KEY`
- **Groq** (free, fastest): key at https://console.groq.com/keys →
  `GROQ_API_KEY`
- **Anthropic** (paid): `ANTHROPIC_API_KEY`

Everything AI-related — the AI Assist panel on `/new`, and Translate /
Summarize / Suggest tags on a note page — runs through
`src/lib/ai/tasks.ts`, which is the only file that calls a model. Adding a
new model means adding one entry to `src/lib/ai/models.ts`; nothing else
needs to change.

## 3c. Uploads (optional, but the upload button on a note page needs both)

- **Cloudflare R2** (free tier, 10GB) — for anything that isn't an image or
  video: PDFs, docx, xlsx, md, 50MB+ files.
  1. Create an R2 bucket at https://dash.cloudflare.com → R2
  2. Create an API token scoped to that bucket → `R2_ACCOUNT_ID`,
     `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
  3. Set `R2_BUCKET` to the bucket name
  4. Enable public access (or a custom domain) on the bucket and set
     `R2_PUBLIC_URL` to that base URL — this is what note pages link to
- **Cloudinary** (free tier) — for images and video, so they render with
  Cloudinary's CDN/transformations instead of just linking out.
  1. Sign up at https://cloudinary.com, grab your Dashboard's cloud name,
     API key, and API secret → `CLOUDINARY_CLOUD_NAME`,
     `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

Uploads go straight from your browser to R2/Cloudinary using a short-lived
signed URL from `/api/upload/sign` (`src/lib/storage/`) — file bytes never
pass through a Vercel function, which caps request bodies at 4.5MB. Which
provider a file goes to is decided by mime type
(`src/lib/storage/media-kind.ts`): images/video → Cloudinary, everything
else → R2.

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

- URL / YouTube / PDF / docx / xlsx auto-ingestion pipeline (uploads work;
  turning an uploaded PDF into a summarized/tagged page is the next step)
- Inngest background jobs
- Obsidian one-way sync
