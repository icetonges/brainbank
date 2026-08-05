export type { SeedPage, GuideResource, ClassroomCategory } from "./types";

// All 7 pages for DeepLearningAI > Agentic AI Lab, in display order (1-7):
// the 7 real DeepLearning.AI lab notebooks the user uploaded (Module 2
// Section 4, Module 2 Section 7, Module 3 Section 4, Module 3 Section 5,
// Module 4 Section 5, Module 5 Section 4, Module 5 Section 6) — code +
// narrative, not the earlier templated "Agentic AI" section (deleted for
// low source-material quality; this is a separate section, not a
// replacement of it under the same name).
//
// bodyEn on every page is a byte-for-byte copy of the corresponding
// uploaded .md file. bodyZh is a full hand-written Chinese translation of
// the narrative Markdown/HTML — every ```python block, inline code, JSON
// example, and embedded LLM prompt string is left in English untouched,
// since those are program input/output whose behavior would change if
// translated, not narrative text. See all-pages.ts's header comment for
// how it was generated.
export { ALL_PAGES } from "./all-pages";
