"""
/v1/embeddings for llmpowerhouse agent-server (FastAPI).

Adds the one route brainbank's knowledge engine needs. Everything else on
agent-server is untouched.

WIRING (2 steps, in your agent-server main module):

    from embeddings_route import router as embeddings_router, set_auth_dependency

    # Reuse agent-server's OWN key check — whatever the existing
    # /v1/chat/completions route depends on. Pass the callable itself,
    # not a call to it:
    set_auth_dependency(require_api_key)     # <-- your dependency's real name

    app.include_router(embeddings_router)

If you'd rather not touch a dependency wiring, you can instead just paste
the `create_embeddings` function body into your main file as a normal
@app.post("/v1/embeddings") route with your usual Depends(...) — the logic
below is self-contained.

WHY AN ALLOWLIST: HANDOFF-FOR-WINDOWS.md §2 is explicit that an
unrecognized model tag makes Ollama try to *download* it, "which is not
something a web request should be able to trigger." That applies just as
much here as it does to chat, so the model name is checked against a fixed
set rather than passed through.
"""

from __future__ import annotations

import os
from typing import Callable, List, Optional, Union

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

# Ollama listens locally on the same Mac; this never leaves the machine.
OLLAMA_BASE = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")

# Embedding a batch of short strings is fast, but a cold model load is not
# (first call after boot pulls weights into memory).
EMBED_TIMEOUT_SECONDS = float(os.environ.get("EMBED_TIMEOUT_SECONDS", "60"))

# Only these may be requested. Add to this set deliberately — see the
# module docstring for why this isn't a passthrough.
ALLOWED_EMBEDDING_MODELS = {
    "nomic-embed-text",
    "nomic-embed-text:latest",
}

DEFAULT_EMBEDDING_MODEL = "nomic-embed-text"

# Max texts per request — brainbank sends at most ~8 (one diary entry's
# candidate atoms), so this is generous. Bounds memory and request time.
MAX_INPUTS = 64
MAX_CHARS_PER_INPUT = 8000

router = APIRouter()

# Filled in by set_auth_dependency() so this module doesn't have to import
# from agent-server's main file (which would create a circular import).
_auth_dependency: Optional[Callable] = None


def set_auth_dependency(dep: Callable) -> None:
    """Point this module at agent-server's existing API-key dependency."""
    global _auth_dependency
    _auth_dependency = dep


async def _require_auth():
    """Delegates to whatever set_auth_dependency() was given.

    Fails CLOSED: if wiring was forgotten, every request is rejected rather
    than silently exposing an unauthenticated embeddings endpoint through
    the Tailscale Funnel.
    """
    if _auth_dependency is None:
        raise HTTPException(
            status_code=500,
            detail="embeddings route is not wired to an auth dependency — "
                   "call set_auth_dependency(require_api_key) at startup",
        )
    result = _auth_dependency()
    if hasattr(result, "__await__"):
        result = await result
    return result


class EmbeddingsRequest(BaseModel):
    input: Union[str, List[str]]
    model: str = DEFAULT_EMBEDDING_MODEL
    # Accepted and ignored — OpenAI clients send it; Ollama has no analogue.
    encoding_format: Optional[str] = None


async def _embed_via_ollama(client: httpx.AsyncClient, model: str, texts: List[str]) -> List[List[float]]:
    """Newer Ollama: POST /api/embed, batch, -> {"embeddings": [[...], ...]}"""
    res = await client.post(
        f"{OLLAMA_BASE}/api/embed",
        json={"model": model, "input": texts},
        timeout=EMBED_TIMEOUT_SECONDS,
    )
    res.raise_for_status()
    body = res.json()
    vectors = body.get("embeddings")
    if not isinstance(vectors, list) or len(vectors) != len(texts):
        raise ValueError(f"/api/embed returned {type(vectors).__name__} for {len(texts)} inputs")
    return vectors


async def _embed_via_ollama_legacy(client: httpx.AsyncClient, model: str, texts: List[str]) -> List[List[float]]:
    """Older Ollama: POST /api/embeddings, ONE text per call, -> {"embedding": [...]}"""
    vectors: List[List[float]] = []
    for text in texts:
        res = await client.post(
            f"{OLLAMA_BASE}/api/embeddings",
            json={"model": model, "prompt": text},
            timeout=EMBED_TIMEOUT_SECONDS,
        )
        res.raise_for_status()
        vector = res.json().get("embedding")
        if not isinstance(vector, list):
            raise ValueError("/api/embeddings returned no embedding")
        vectors.append(vector)
    return vectors


@router.post("/v1/embeddings")
async def create_embeddings(req: EmbeddingsRequest, _=Depends(_require_auth)):
    """OpenAI-compatible embeddings, backed by Ollama on this machine."""

    if req.model not in ALLOWED_EMBEDDING_MODELS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"model '{req.model}' is not an allowed embedding model. "
                f"Allowed: {sorted(ALLOWED_EMBEDDING_MODELS)}. "
                "Add it to ALLOWED_EMBEDDING_MODELS in embeddings_route.py "
                "after pulling it with `ollama pull`."
            ),
        )

    texts = [req.input] if isinstance(req.input, str) else list(req.input)
    texts = [t for t in texts if isinstance(t, str)]

    if not texts:
        raise HTTPException(status_code=400, detail="input must be a non-empty string or list of strings")
    if len(texts) > MAX_INPUTS:
        raise HTTPException(status_code=400, detail=f"too many inputs (max {MAX_INPUTS})")

    texts = [t[:MAX_CHARS_PER_INPUT] for t in texts]

    async with httpx.AsyncClient() as client:
        try:
            vectors = await _embed_via_ollama(client, req.model, texts)
        except (httpx.HTTPStatusError, ValueError, KeyError):
            # /api/embed didn't work — this Ollama predates it. Fall back to
            # the one-at-a-time legacy route before giving up.
            try:
                vectors = await _embed_via_ollama_legacy(client, req.model, texts)
            except Exception as err:
                raise HTTPException(
                    status_code=502,
                    detail=f"ollama embedding failed: {err}",
                ) from err
        except httpx.RequestError as err:
            raise HTTPException(
                status_code=502,
                detail=f"could not reach ollama at {OLLAMA_BASE}: {err}",
            ) from err

    total_chars = sum(len(t) for t in texts)
    return {
        "object": "list",
        "model": req.model,
        "data": [
            {"object": "embedding", "index": i, "embedding": vec}
            for i, vec in enumerate(vectors)
        ],
        # Ollama doesn't report token counts for embeddings; a rough
        # char/4 estimate keeps OpenAI clients that read this field happy
        # without inventing a precise-looking number.
        "usage": {
            "prompt_tokens": total_chars // 4,
            "total_tokens": total_chars // 4,
        },
    }
