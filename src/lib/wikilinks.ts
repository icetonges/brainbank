// Obsidian-style [[Note Title]] links inside note text. This is the
// mechanism behind PLAN.md §5/§7/§8: you write notes the way you would in
// Obsidian, and the connection graph (edges table) is derived from those
// links automatically instead of needing a separate "link this to that" UI
// step. [[Title|Display text]] is also recognized; only the title part
// (before the |) is used to resolve the link.

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

/** Every distinct [[Title]] referenced across one or more text blocks. */
export function extractWikilinkTitles(...blocks: (string | null | undefined)[]): string[] {
  const titles = new Set<string>();
  for (const block of blocks) {
    if (!block) continue;
    for (const match of block.matchAll(WIKILINK_RE)) {
      const title = match[1].trim();
      if (title) titles.add(title);
    }
  }
  return [...titles];
}
