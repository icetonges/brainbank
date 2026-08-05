export type { SeedPage, GuideResource, ClassroomCategory } from "./types";

// All 40 pages for DeepLearningAI > Agentic AI, in display order (1-40):
// Study Plan, then 1.1-5.7 (the study guide's own module/section numbers,
// preserved as-is in each page's title), then Glossary, then Capstone.
//
// bodyEn on every page is a byte-for-byte copy of the corresponding file
// in the user's Agentic_AI_Technical_Study_Guide/ folder (Study Plan,
// 01-introduction-to-agentic-workflows/*.md ... 05-highly-autonomous-patterns/*.md,
// Glossary, Capstone) — see all-pages.ts's header comment for how it was
// generated. This replaces the earlier, self-authored module-00..07
// content (left in place below, unused, since files can't be deleted from
// this workspace) which did not match those source files.
export { ALL_PAGES } from "./all-pages";
