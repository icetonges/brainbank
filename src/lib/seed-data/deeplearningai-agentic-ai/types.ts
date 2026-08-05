// Shared shape for one DeepLearningAI > Agentic AI classroom page. Mirrors
// what publishClassroomArticle (src/app/classroom/actions.ts) would have
// produced from the composer + AI publish assist, but written by hand since
// this is a bulk import that bypasses that pipeline (see the seed script's
// header comment for why).
export interface GuideResource {
  title: string;
  url: string;
  description: string;
}

export type ClassroomCategory =
  | "knowledge"
  | "skill"
  | "mcp"
  | "api"
  | "best-practices"
  | "use-cases"
  | "step-by-step"
  | "ai-evaluation"
  | "ai-models"
  | "ai";

export interface SeedPage {
  /** Display order within the "Agentic AI" section (also used for the
   * "NN - " title prefix, matching the numbering convention already used
   * elsewhere on /classroom, e.g. the "Local LLM Server" section). */
  order: number;
  /** Short, ascii, hyphen-free-ish key used to build the final slug:
   * `dlai-agentic-ai-${order}-${key}`. Keep short; slugify() truncates at
   * 80 chars anyway but a predictable key makes the seed idempotent. */
  key: string;
  titleEn: string;
  titleZh: string;
  category: ClassroomCategory;
  summaryEn: string;
  summaryZh: string;
  tags: string[];
  bodyEn: string;
  bodyZh: string;
  learningMapEn: string;
  learningMapZh: string;
  handsOnEn: string;
  handsOnZh: string;
  resources: GuideResource[];
}
