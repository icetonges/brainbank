"use server";

import { auth } from "@/auth";
import { rebuildRelatedEdges } from "@/lib/notes/link-related";
import { revalidatePath } from "next/cache";

async function requireOwner() {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
}

/**
 * Re-derives every auto "related" edge (tag-based, not hand-authored
 * [[wikilinks]]) under the current rule in link-related.ts, which skips
 * tags too common to signal a real relationship. One-time cleanup button
 * for graphs that got over-linked under the old "any shared tag counts"
 * rule — new edges already follow the tighter rule automatically, but
 * existing over-linked edges only go away by recomputing them.
 */
export async function rebuildRelatedEdgesAction() {
  await requireOwner();
  await rebuildRelatedEdges();
  revalidatePath("/graph");
}
