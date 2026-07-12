import { classroomCategoryEnum, type ClassroomCategory } from "@/lib/db/schema";

// The AI Classroom subtabs, in display order. Values come straight from the
// DB enum so the tabs, the publish assist's classifier, and the `category`
// column can never disagree. Import this only from server components — pass
// plain arrays down to client components to keep drizzle out of the bundle.

export const CLASSROOM_TAB_LABELS: Record<ClassroomCategory, string> = {
  knowledge: "Knowledge",
  skill: "Skill",
  mcp: "MCP",
  api: "API",
  "best-practices": "Best Practices",
  "use-cases": "Use Cases",
  "step-by-step": "Step by Step",
  "ai-evaluation": "AI Evaluation",
  "ai-models": "AI Models",
  ai: "AI",
};

export interface ClassroomTab {
  value: ClassroomCategory;
  label: string;
}

export const CLASSROOM_TABS: ClassroomTab[] = classroomCategoryEnum.enumValues.map(
  (value) => ({ value, label: CLASSROOM_TAB_LABELS[value] }),
);

export function isClassroomCategory(value: string): value is ClassroomCategory {
  return (classroomCategoryEnum.enumValues as readonly string[]).includes(value);
}
