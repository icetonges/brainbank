import { db } from "@/lib/db";
import { knowledgeAtoms } from "@/lib/db/schema";
import type { AtomKind } from "@/lib/db/schema";
import { and, eq, ne, sql, cosineDistance, desc, gt } from "drizzle-orm";

// Finding "do I already believe something like this?" — the query that
// makes reinforcement possible instead of endless near-duplicates.
//
// Two tiers, because the semantic tier can be unavailable:
//   1. pgvector cosine similarity over atom embeddings (HNSW index, see
//      schema.ts) — catches paraphrases keyword search never would
//      ("mornings are my best hours" / "does deep work before 10am").
//   2. A keyword-overlap fallback for when agent-server is asleep and the
//      candidate couldn't be embedded. Much weaker, but it means a
//      distillation run during an outage still reinforces the obvious
//      matches instead of duplicating everything.
//
// Either way this only ever returns CANDIDATES — reconcileAtom (tasks.ts)
// makes the actual same/contradicts/refines/distinct call, because vector
// distance genuinely cannot distinguish a claim from its negation.

export interface AtomCandidateMatch {
  id: number;
  kind: string;
  statement: string;
  detail: string;
  confidence: number;
  reinforcementCount: number;
  /** 0-1, higher is closer. Cosine similarity, or a crude overlap ratio
   *  when this came from the keyword fallback. */
  similarity: number;
}

/** Cosine similarity below this isn't worth spending a reconcile call on —
 *  tuned to be permissive, since a false candidate costs one cheap local
 *  call while a missed match costs a permanent duplicate atom. */
const SIMILARITY_FLOOR = 0.55;

/** How many candidates to reconcile per new atom. Beyond a handful, the
 *  extra calls cost more than the marginal chance of a match. */
const MAX_CANDIDATES = 5;

/**
 * Nearest existing active atoms to `embedding` by cosine similarity.
 * `excludeId` skips an atom comparing against itself (used when
 * re-embedding or merging).
 */
export async function similarAtomsByVector(
  embedding: number[],
  limit = MAX_CANDIDATES,
  excludeId?: number,
): Promise<AtomCandidateMatch[]> {
  const similarity = sql<number>`1 - (${cosineDistance(knowledgeAtoms.embedding, embedding)})`;

  const rows = await db
    .select({
      id: knowledgeAtoms.id,
      kind: knowledgeAtoms.kind,
      statement: knowledgeAtoms.statement,
      detail: knowledgeAtoms.detail,
      confidence: knowledgeAtoms.confidence,
      reinforcementCount: knowledgeAtoms.reinforcementCount,
      similarity,
    })
    .from(knowledgeAtoms)
    .where(
      and(
        eq(knowledgeAtoms.status, "active"),
        excludeId ? ne(knowledgeAtoms.id, excludeId) : undefined,
        gt(similarity, SIMILARITY_FLOOR),
      ),
    )
    .orderBy(desc(similarity))
    .limit(limit);

  return rows;
}

/** Words too common to carry signal in the keyword fallback. Deliberately
 *  short — this path is already a degraded mode, not a search engine. */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been",
  "to", "of", "in", "on", "at", "for", "with", "that", "this", "it", "as", "by",
  "from", "has", "have", "had", "not", "no", "does", "do", "did", "than", "then",
  "when", "which", "who", "their", "they", "them", "his", "her", "its", "prefers",
  "wants", "likes", "author", "person",
]);

function keywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s一-鿿]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/**
 * Degraded-mode candidate search used when the candidate has no embedding
 * (agent-server unreachable — see embedTextsOrNull). Pulls active atoms of
 * the same kind and ranks by Jaccard-ish keyword overlap in memory.
 *
 * Bounded by `scanLimit` because this deliberately does a table scan: at
 * personal scale (hundreds to low thousands of atoms) that's fine, and it
 * avoids adding a full-text index for a path that should be rare.
 */
export async function similarAtomsByKeyword(
  statement: string,
  kind: AtomKind,
  limit = MAX_CANDIDATES,
  scanLimit = 500,
): Promise<AtomCandidateMatch[]> {
  const target = keywords(statement);
  if (target.size === 0) return [];

  const rows = await db
    .select({
      id: knowledgeAtoms.id,
      kind: knowledgeAtoms.kind,
      statement: knowledgeAtoms.statement,
      detail: knowledgeAtoms.detail,
      confidence: knowledgeAtoms.confidence,
      reinforcementCount: knowledgeAtoms.reinforcementCount,
    })
    .from(knowledgeAtoms)
    .where(and(eq(knowledgeAtoms.status, "active"), eq(knowledgeAtoms.kind, kind)))
    .orderBy(desc(knowledgeAtoms.lastReinforcedAt))
    .limit(scanLimit);

  return rows
    .map((r) => {
      const other = keywords(r.statement);
      let shared = 0;
      for (const w of target) if (other.has(w)) shared++;
      const union = target.size + other.size - shared;
      return { ...r, similarity: union > 0 ? shared / union : 0 };
    })
    .filter((r) => r.similarity >= 0.34)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/** Whichever candidate search is available for this atom. */
export async function findCandidates(
  statement: string,
  kind: AtomKind,
  embedding: number[] | null,
): Promise<AtomCandidateMatch[]> {
  return embedding
    ? similarAtomsByVector(embedding)
    : similarAtomsByKeyword(statement, kind);
}
