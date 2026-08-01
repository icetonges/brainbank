// The diary's life-tag vocabulary.
//
// Two-layer on purpose. This file is layer one: a small, stable, curated
// set of life areas that the auto-tagger is steered toward, so that
// "work" doesn't drift into "job"/"career"/"office" across a year of
// entries and fragment every query that groups by area. Layer two is
// free-form — the tagger may also propose specific tags ("q3-planning",
// "marathon-training") which land in the same shared `tags` table as
// classroom articles, keeping the graph unified.
//
// Practically: LIFE_AREAS drives the filter chips, the heatmap colors, and
// the "what does my time actually go to" rollups; free tags drive
// fine-grained recall and cross-linking into classroom knowledge.

export interface LifeArea {
  /** Stored in the shared `tags` table exactly as written here. */
  slug: string;
  labelEn: string;
  labelZh: string;
  /** Drives the chip/constellation color. Tailwind-independent hex so it
   *  can be used in canvas rendering too (see knowledge-constellation). */
  color: string;
  emoji: string;
}

export const LIFE_AREAS: LifeArea[] = [
  { slug: "daily", labelEn: "Daily activity", labelZh: "日常", color: "#64748b", emoji: "🌤" },
  { slug: "work", labelEn: "Work", labelZh: "工作", color: "#3b82f6", emoji: "💼" },
  { slug: "side-project", labelEn: "Side project", labelZh: "副业项目", color: "#8b5cf6", emoji: "🚀" },
  { slug: "hobby", labelEn: "Hobby", labelZh: "爱好", color: "#ec4899", emoji: "🎨" },
  { slug: "kids", labelEn: "Kids", labelZh: "孩子", color: "#f59e0b", emoji: "🧒" },
  { slug: "family", labelEn: "Family", labelZh: "家庭", color: "#f97316", emoji: "🏡" },
  { slug: "life", labelEn: "Life", labelZh: "生活", color: "#10b981", emoji: "🌱" },
  { slug: "health", labelEn: "Health", labelZh: "健康", color: "#22c55e", emoji: "💪" },
  { slug: "learning", labelEn: "Learning", labelZh: "学习", color: "#06b6d4", emoji: "📚" },
  { slug: "idea", labelEn: "Idea", labelZh: "想法", color: "#eab308", emoji: "💡" },
  { slug: "money", labelEn: "Money", labelZh: "财务", color: "#14b8a6", emoji: "💰" },
  { slug: "travel", labelEn: "Travel", labelZh: "旅行", color: "#a855f7", emoji: "✈️" },
  { slug: "reflection", labelEn: "Reflection", labelZh: "反思", color: "#6366f1", emoji: "🪞" },
];

export const LIFE_AREA_SLUGS = LIFE_AREAS.map((a) => a.slug);

const BY_SLUG = new Map(LIFE_AREAS.map((a) => [a.slug, a]));

export function lifeArea(slug: string): LifeArea | undefined {
  return BY_SLUG.get(slug);
}

export function isLifeArea(slug: string): boolean {
  return BY_SLUG.has(slug);
}

/** Stable color for any tag — curated life areas get their designed color,
 *  free-form tags get a deterministic hue derived from the name so the same
 *  tag is always the same color across sessions without storing anything. */
export function tagColor(slug: string): string {
  const area = BY_SLUG.get(slug);
  if (area) return area.color;
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360} 60% 58%)`;
}

/** Color per atom kind — used by the constellation to make the knowledge
 *  graph readable at a glance (goals vs patterns vs people). */
export const ATOM_KIND_COLORS: Record<string, string> = {
  fact: "#64748b",
  preference: "#8b5cf6",
  pattern: "#06b6d4",
  goal: "#f59e0b",
  person: "#f97316",
  project: "#3b82f6",
  skill: "#22c55e",
  question: "#ec4899",
  idea: "#eab308",
};

export const INSIGHT_KIND_META: Record<
  string,
  { labelEn: string; labelZh: string; color: string; emoji: string }
> = {
  highlight: { labelEn: "Highlight", labelZh: "亮点", color: "#f59e0b", emoji: "✨" },
  theme: { labelEn: "Theme", labelZh: "主题", color: "#06b6d4", emoji: "🧵" },
  idea: { labelEn: "Idea", labelZh: "灵感", color: "#eab308", emoji: "💡" },
  business: { labelEn: "Business", labelZh: "商业机会", color: "#22c55e", emoji: "📈" },
  recommendation: { labelEn: "Do next", labelZh: "下一步", color: "#3b82f6", emoji: "🎯" },
  reflection: { labelEn: "Reflection", labelZh: "反思", color: "#8b5cf6", emoji: "🪞" },
};
