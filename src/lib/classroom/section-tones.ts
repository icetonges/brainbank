/**
 * Rotating hues for a subcategory's section blocks — colored left bar +
 * tinted header + dot, so "Quick Start" vs "Core Mechanisms" read as
 * clearly separate shelves at a glance instead of one undifferentiated
 * list. Shared across every place sections render — the /classroom grid,
 * the homepage's "Browse by Category" preview, and the classroom article
 * side nav — so the same section reads the same color everywhere it
 * appears. Index-based (not per-name/id), so it stays consistent without
 * tracking a stored color per section. Tailwind needs literal class
 * strings, hence the lookup table rather than building classes from a
 * variable.
 */
export const SECTION_TONES = [
  { bar: "border-l-info", text: "text-info", tint: "bg-info/10", dot: "bg-info" },
  { bar: "border-l-success", text: "text-success", tint: "bg-success/10", dot: "bg-success" },
  { bar: "border-l-warn", text: "text-warn", tint: "bg-warn/10", dot: "bg-warn" },
  { bar: "border-l-accent", text: "text-accent", tint: "bg-accent/10", dot: "bg-accent" },
] as const;

export type SectionTone = (typeof SECTION_TONES)[number];

export function sectionTone(index: number): SectionTone {
  return SECTION_TONES[index % SECTION_TONES.length];
}

/** The neutral tone for a subcategory's "more articles" catch-all — kept
 * deliberately gray/untinted (not part of the rotation) so it reads as
 * "everything else," distinct from a real named section. */
export const NEUTRAL_TONE: SectionTone = {
  bar: "border-l-border",
  text: "text-fg-secondary",
  tint: "bg-bg",
  dot: "bg-fg-secondary/60",
};
