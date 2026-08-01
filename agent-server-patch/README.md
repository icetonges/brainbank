# agent-server patch — `/v1/embeddings`

Adds the one route brainbank's knowledge engine needs. Nothing else on
agent-server changes.

**Target:** `llmpowerhouse agent-server 0.8.0-step5.7-streaming` (FastAPI)

Current routes (from `/openapi.json`):

```
GET   /health
GET   /v1/models
POST  /v1/feedback
POST  /v1/chat/completions
```

After this patch, `POST /v1/embeddings` joins them.

---

## Install (on the Mac)

**1. Confirm the model is pulled**

```bash
ollama list | grep nomic
ollama pull nomic-embed-text     # if missing
```

**2. Confirm Ollama's embed route works locally**

```bash
curl -s http://127.0.0.1:11434/api/embed \
  -d '{"model":"nomic-embed-text","input":["hello"]}' | head -c 200
```

Expect `{"model":"nomic-embed-text","embeddings":[[0.0123,...]]}`.

If that 404s, your Ollama predates `/api/embed` — fine, the patch falls
back to the older `/api/embeddings` automatically. Verify that one instead:

```bash
curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"nomic-embed-text","prompt":"hello"}' | head -c 200
```

**3. Drop in the file**

Copy `embeddings_route.py` next to agent-server's main module.

**4. Wire it up** — two lines in the main module:

```python
from embeddings_route import router as embeddings_router, set_auth_dependency

# Reuse agent-server's OWN key check — pass the same callable that
# /v1/chat/completions uses in its Depends(...). Pass the function, not a
# call to it.
set_auth_dependency(require_api_key)      # <-- your dependency's real name

app.include_router(embeddings_router)
```

If your auth is done differently (middleware, a custom `Security(...)`,
scope checks), skip `set_auth_dependency` entirely and instead paste the
body of `create_embeddings` into your main file as a normal route with your
usual `Depends(...)`. The logic is self-contained.

**5. Restart agent-server**, then from Windows:

```powershell
.\check-embeddings.ps1
```

Expect: `OK - 768 dimensions`.

**6. Backfill** — open `/assistant` and hit **Backfill embeddings** to
vectorize any atoms created before this worked.

---

## Design notes

**The model name is allowlisted, not passed through.**
`HANDOFF-FOR-WINDOWS.md` §2 warns that an unrecognized tag makes Ollama try
to *download* it, "which is not something a web request should be able to
trigger." Same risk applies here, so `ALLOWED_EMBEDDING_MODELS` gates it.
Adding a model is a deliberate one-line edit after `ollama pull`.

**Auth fails closed.** If `set_auth_dependency` is never called, every
request 500s rather than silently exposing an unauthenticated embeddings
endpoint through the Funnel.

**Ollama version-agnostic.** Tries batch `/api/embed` first, falls back to
per-text `/api/embeddings`.

**Bounds.** Max 64 inputs, 8000 chars each. brainbank sends at most ~8 per
diary entry, so this is generous — it exists to keep a malformed request
from pinning the machine.

---

## The 401 worth checking

Your discovery run showed `/health` and `/v1/models` returning **401** with
the bearer token, while `/openapi.json`, `/docs`, and `/redoc` returned 200
(those are unauthenticated by FastAPI default).

Since the app's own `/llm` status card works, the key in `.env.local` is
presumably valid — which makes this most likely a PowerShell artifact, but
it's worth ruling out before blaming the patch if step 5 fails. From the
Mac, with the same key:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer <key>" \
  https://llmpowerhouses.taila4b91f.ts.net:8443/health
```

- `200` → PowerShell artifact, ignore it.
- `401` → the key in `.env.local` doesn't match what `keys_admin.py` has,
  or its scope doesn't cover these routes. Worth fixing regardless, since
  the embeddings route will reject the same way.
