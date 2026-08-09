# Diary + self-evolving assistant — setup

Two new sections, both owner-only (`middleware.ts` matches `/diary` and
`/assistant`, and every page re-checks the session itself):

- **`/diary`** — daily entries. Simple to write into, rich underneath.
- **`/assistant`** — the knowledge base built from those entries.

---

## 1. Enable pgvector (do this FIRST)

`knowledge_atoms.embedding` is a `vector(768)` column with an HNSW index.
`db:push` will **fail** if the extension doesn't exist yet.

Run once against your Neon database (Neon SQL Editor, or `psql`):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## 2. Push the schema

```bash
npm run db:push
```

New tables: `diary_entries`, `knowledge_atoms`, `knowledge_atom_sources`,
`knowledge_links`, `knowledge_insights`, `knowledge_insight_atoms`,
`knowledge_runs`. New enum values/enums: `source_type.diary`,
`title_source`, `diary_mood`, `atom_kind`, `atom_status`,
`knowledge_origin`, `atom_link_type`, `insight_kind`, `insight_status`,
`knowledge_run_kind`.

Nothing existing is altered destructively — `source_type` gains a value,
everything else is additive.

## 3. Confirm the embedding model is reachable

The knowledge engine embeds atoms with `nomic-embed-text` on the
agent-server. It is deliberately **not** in the model registry (it's not a
chat model and must never appear in a picker).

From the repo root, in PowerShell:

```powershell
.\check-embeddings.ps1
```

That reads `LOCAL_LLM_FUNNEL_URL` / `LOCAL_LLM_SHARED_SECRET` out of
`.env.local` (they're only loaded by Next.js at runtime, so they are *not*
in your shell session) and probes all three endpoint shapes agent-server
might expose, reporting which one answers and how many dimensions it
returns.

**If nothing answers**, on the Mac:

```bash
ollama list | grep nomic
ollama pull nomic-embed-text
```

then check that agent-server actually proxies an embeddings route — if it
only forwards `/v1/chat/completions`, it needs one added (or Ollama's
`/api/embed` exposed through the Funnel).

`src/lib/ai/embeddings.ts` auto-detects whichever of these works and
remembers it, so no code change is needed once one responds:

| Route | Shape |
|---|---|
| `POST /v1/embeddings` | OpenAI-compatible, batch |
| `POST /api/embed` | Ollama newer, batch |
| `POST /api/embeddings` | Ollama older, one text per request |

Not fatal if it's missing — atom matching silently degrades to keyword
overlap and the atoms still get stored. Once it's working, hit **Backfill
embeddings** on `/assistant` to vectorize anything created meanwhile.

## 4. Build

```bash
npm run build
```

---

## How the knowledge engine works

```
diary entry saved
      ↓  (background job, doesn't block the save)
extract candidate atoms          local model only, never Google
      ↓
embed each candidate             nomic-embed-text
      ↓
find similar existing atoms      pgvector cosine, HNSW
      ↓
reconcile each match             same / contradicts / refines / distinct
      ├── same        → reinforce: confidence↑, count↑, evidence appended
      ├── contradicts → new atom + unresolved link → review queue
      ├── refines     → new atom + "refines" link
      └── distinct    → new atom
      ↓
mark entry distilled
```

Separately, **synthesis** (the ✨ Think button) reads the *atoms* — not raw
entries — and produces highlights, themes, ideas, business angles, and
recommendations, each linked back to the atoms that justify it.

### Why it gets smarter rather than just bigger

| Mechanism | Effect |
|---|---|
| Reinforcement | Repeated observations become stronger beliefs, not duplicate rows |
| Contradiction | Beliefs get **updated** — you pick which side survives |
| Decay | Unconfirmed knowledge fades into a "gone quiet" queue after ~10 weeks |
| Manual trim / pin / merge | You stay the authority on what's true about you |
| Evidence trail | Every claim traces back to the entries that produced it |

Nothing is ever auto-deleted. Decay lowers salience; only you archive.

## Privacy

Raw diary text is processed by the **self-hosted agent-server only**. This
is structural, not a convention: `LOCAL_ONLY_CHAIN` (`lib/ai/models.ts`)
strips every non-local model out of the fallback chain for the `diary-title`
and `distill` tasks, and an explicit non-local model override is ignored
rather than honored. There is no code path that sends an entry to Google.

The cost, accepted deliberately: when the Mac is asleep, distillation fails
and retries later (the entry itself always saves fine). Catch up with the
**Catch up** button on `/assistant`.

Synthesis *is* allowed on the normal chain — it reads distilled atoms, which
are one abstraction step off raw text.

## Notes

- Diary entries are `notes` rows (`source_type = "diary"`, always
  `private`). They reuse the image-upload pipeline, the shared tag table,
  `[[wikilinks]]`, and search. They're excluded from the homepage list, and
  `/notes/<slug>` redirects to `/diary/<slug>`.
- Deleting an entry does **not** delete knowledge learned from it — only
  that entry's row in the evidence trail.
- Hand-added atoms (`/assistant` → "Teach it directly") are created pinned
  and high-confidence, and never decay.
