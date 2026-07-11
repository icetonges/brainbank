# Local setup

Phase 1 is scaffolded: Next.js app, database schema, single-owner auth, and
the dark/light theme shell. The AI layer (model registry, AI Assist,
translate/summarize/tag), the interactive graph, file uploads (Cloudflare
R2 + Cloudinary), the auto-ingestion pipeline (paste a URL/YouTube link or
upload a PDF/docx/xlsx and get a drafted page back), note editing/status/
delete, search, and Obsidian one-way sync are all wired up — see steps 3,
3c, 3d, and 3e.

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

## 3d. Ingestion pipeline (optional, needs an AI key + the Inngest dev server)

Pasting a URL/YouTube link or uploading a PDF/docx/xlsx on `/new` creates a
draft note immediately and runs the actual fetch/parse/AI-draft work as a
background job (Inngest — PLAN.md §5), because that can easily take longer
than a normal request allows.

1. In a second terminal, alongside `npm run dev`, run:
   ```
   npx inngest-cli dev
   ```
   This starts a local Inngest Dev Server (UI at http://localhost:8288)
   that auto-discovers your app's `/api/inngest` endpoint — no
   `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` needed for local dev, those
   are only for pointing at Inngest Cloud in production.
2. Ingestion also needs at least one AI provider key set (step 3b) — the
   drafting step is the one part of the pipeline that has to be an LLM.
3. Watch progress either on the note page itself (it polls and shows a
   "Processing…" banner) or in the Inngest Dev Server UI, which shows each
   step and lets you replay a failed run.

For production on Vercel, create a free account at https://inngest.com,
connect your Vercel project (there's an official Inngest×Vercel
integration that sets the env vars for you), or set
`INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` manually.

## 3e. Obsidian sync (optional — one-way, vault → site)

Lets you write notes in Obsidian and pull them in, instead of (or
alongside) using the web app's own editor (PLAN.md §8).

1. Push your vault, or just the notes you want synced, to a `notes/`
   folder in a GitHub repo — the same `brainbank` repo or a separate
   private one both work. The
   [Obsidian Git plugin](https://github.com/denolehov/obsidian-git) can
   automate the push, or just `git add`/`commit`/`push` by hand.
2. Create a GitHub personal access token with read-only access to that
   repo's contents (a fine-grained PAT scoped to just that repo is enough:
   https://github.com/settings/tokens?type=beta) → `GITHUB_TOKEN`
3. Set `GITHUB_OBSIDIAN_REPO` to `"owner/repo"`. `GITHUB_OBSIDIAN_BRANCH`
   (default `main`) and `GITHUB_OBSIDIAN_PATH` (default `notes`) only need
   changing if your setup differs from the defaults.
4. Also needs an AI key (step 3b) and the Inngest dev server (step 3d)
   running — freeform notes (without What/How/Why/Other headers) go
   through the same AI drafting step as any other source.
5. Sign in, go to `/obsidian`, click **Sync now**. Notes already using the
   app's `## What` / `## How` / `## Why` / `## Other` headers are saved
   as-is, no AI call; anything else gets auto-drafted into that template.
   Frontmatter (`title`, `tags: [a, b]`, `status`, `language`) is read if
   present.

### Automatic sync on every GitHub push

1. Generate a dedicated webhook secret:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Save it as `GITHUB_WEBHOOK_SECRET` in Vercel Production and redeploy.
3. In the configured GitHub repository, open **Settings → Webhooks → Add webhook**.
4. Set **Payload URL** to `https://aibrainbank.vercel.app/api/obsidian-webhook`.
5. Set **Content type** to `application/json`, paste the same secret, choose
   **Just the push event**, and activate the webhook.

GitHub push deliveries are verified with HMAC-SHA256. Only pushes to the
configured repository/branch that change `.md` files under the configured
vault path trigger a sync. The existing blob-SHA comparison ensures unchanged
notes are not reprocessed.

Re-syncing only processes files whose git blob sha changed since the last
run, so it's cheap to run repeatedly. It's one-way — editing a note in the
web app does not write back to the vault, and there's no deletion
handling yet (removing a file from the vault doesn't remove or unpublish
the corresponding note).

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

## Not wired up yet

- Images/video don't go through auto-ingestion yet — the intake form only
  handles PDF/docx/xlsx/URLs/YouTube; attach images/video to an existing
  note via the upload widget on the note page instead
- Obsidian sync is one-way (vault → site) with no deletion handling — see
  step 3e
