export interface ParsedFrontmatter {
  data: Record<string, string | string[]>;
  body: string;
}

/**
 * Minimal YAML-frontmatter parser for Obsidian vault notes — handles the
 * flat scalar + inline-array shape our schema actually uses:
 *
 *   ---
 *   title: My Note
 *   tags: [tag-one, tag-two]
 *   status: published
 *   language: en
 *   ---
 *   body...
 *
 * This is intentionally not a general YAML parser (per PLAN.md §13, code
 * first — a full YAML dependency isn't justified for four flat fields).
 * Multi-line YAML lists (`tags:\n  - a\n  - b`) aren't supported; use the
 * inline `[a, b]` form instead.
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  // Leading whitespace on the opening/closing "---" delimiters and on each
  // key line is tolerated (`\s*` / per-line trim below) — Obsidian, pasting,
  // and various editors can introduce incidental indentation that has no
  // semantic meaning in a flat key: value block, and silently treating an
  // indented file as "no frontmatter" causes it to be misparsed as plain
  // body text instead.
  const match = raw.match(/^\s*---\r?\n([\s\S]*?)\r?\n\s*---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };

  const [, yamlBlock, body] = match;
  const data: Record<string, string | string[]> = {};

  for (const rawLine of yamlBlock.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    const value = rawValue.trim();

    if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      data[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  return { data, body: body ?? "" };
}
