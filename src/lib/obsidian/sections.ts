const SECTION_NAMES = ["what", "how", "why", "other"] as const;
export type SectionName = (typeof SECTION_NAMES)[number];

/**
 * Splits a vault note's body into what/how/why/other by looking for
 * markdown headers matching those four words (any heading level, case
 * insensitive) — the same template the app itself uses, so a note authored
 * directly in Obsidian with `## What` / `## How` / `## Why` / `## Other`
 * sections needs no AI pass at all (PLAN.md §13: code first).
 *
 * Returns null if none of the four headers are present, signalling the
 * caller to fall back to AI drafting (draftNoteFromSource) for freeform
 * notes instead.
 */
export function splitSections(body: string): Partial<Record<SectionName, string>> | null {
  const headerRe = /^#{1,6}\s+(what|how|why|other)\s*$/i;
  const lines = body.split(/\r?\n/);

  const sections: Partial<Record<SectionName, string[]>> = {};
  let current: SectionName | null = null;
  let found = false;

  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      current = m[1].toLowerCase() as SectionName;
      sections[current] = sections[current] ?? [];
      found = true;
      continue;
    }
    if (current) sections[current]!.push(line);
  }

  if (!found) return null;

  const result: Partial<Record<SectionName, string>> = {};
  for (const name of SECTION_NAMES) {
    if (sections[name]) result[name] = sections[name]!.join("\n").trim();
  }
  return result;
}
